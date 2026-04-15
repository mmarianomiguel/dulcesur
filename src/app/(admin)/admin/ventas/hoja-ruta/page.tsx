"use client";

import { nowTimeARG, formatCurrency } from "@/lib/formatters";
import { norm } from "@/lib/utils";
import { useEffect, useState, useCallback, useRef } from "react";
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
  Banknote,
  Landmark,
  FileText,
  Share2,
  Copy,
  ExternalLink,
  Bell,
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
  subtotal: number;
  descuento_porcentaje: number;
  recargo_porcentaje: number;
  monto_pagado: number;
  estado: string;
  observacion: string | null;
  entregado: boolean;
  cliente_id: string | null;
  origen: string | null;
  metodo_entrega: string | null;
  clientes: ClienteInfo | null;
  venta_items: VentaItemRow[];
  pedido_armado: { orden_entrega: number | null; estado: string | null } | null;
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

function buildNotifMensaje({
  tipo,
  primerNombre,
  formaPago,
  montoPendiente,
  montoEfectivo,
  horarioCierre,
}: {
  tipo: "retiro" | "envio";
  primerNombre: string;
  formaPago: string;
  montoPendiente: number;
  montoEfectivo: number;
  horarioCierre?: string;
}): { titulo: string; mensaje: string } {
  const fp = (formaPago || "").toLowerCase();
  const esMixto = fp === "mixto";
  const esEfectivo = fp === "efectivo";

  const fmtMonto = (n: number) =>
    "$" + Math.round(n).toLocaleString("es-AR");

  if (tipo === "retiro") {
    const horario = horarioCierre ? ` hasta las ${horarioCierre}hs` : "";
    let mensaje = `Hola ${primerNombre}, ya podés pasar a retirar tu pedido${horario}.`;
    if (esMixto && montoEfectivo > 0) {
      mensaje += ` Te quedan ${fmtMonto(montoEfectivo)} para completar el pago.`;
    } else if (esEfectivo && montoPendiente > 0) {
      mensaje += ` Recordá que el total a abonar es ${fmtMonto(montoPendiente)}.`;
    }
    return {
      titulo: `${primerNombre}, tu pedido está listo 🎉`,
      mensaje,
    };
  } else {
    let mensaje = `Hola ${primerNombre}, ¡tu pedido es el próximo a entregar! Ya salimos hacia tu local.`;
    if (esMixto && montoEfectivo > 0) {
      mensaje += ` Te quedan ${fmtMonto(montoEfectivo)} para completar el pago.`;
    } else if (esEfectivo && montoPendiente > 0) {
      mensaje += ` Recordá que el total a abonar es ${fmtMonto(montoPendiente)}.`;
    }
    return {
      titulo: `${primerNombre}, tu pedido está en camino 🛵`,
      mensaje,
    };
  }
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
  const [savedOrdenLoaded, setSavedOrdenLoaded] = useState(false);
  const savedOrdenRef = useRef<Record<string, number>>({});
  const [filterEntrega] = useState<"todos" | "envio" | "retiro">("todos");
  const [search, setSearch] = useState("");
  const [showAllPending, setShowAllPending] = useState(true);

  // Historial de entregas
  const [activeTab, setActiveTab] = useState<"pendientes" | "historial">("pendientes");
  const [historialLoading, setHistorialLoading] = useState(false);
  const [historialVentas, setHistorialVentas] = useState<VentaRow[]>([]);
  const [historialPagos, setHistorialPagos] = useState<Record<string, { monto: number; metodo: string; cuenta_bancaria?: string; fecha_hora?: string }[]>>({});
  const [historialDateFrom, setHistorialDateFrom] = useState(getArgentinaToday());
  const [historialDateTo, setHistorialDateTo] = useState(getArgentinaToday());
  const [historialSearch, setHistorialSearch] = useState("");


  // Route view
  const [viewMode, setViewMode] = useState<"list" | "ruta">("list");
  const [currentStop, setCurrentStop] = useState(0);

  // Track how much was actually paid per order (from caja_movimientos)
  const [pagadoPorVenta, setPagadoPorVenta] = useState<Record<string, number>>({});
  const [ncPorVenta, setNcPorVenta] = useState<Record<string, number>>({});

  // Hoja de ruta sharing
  const [hojaRutaId, setHojaRutaId] = useState<string | null>(null);
  const [hojaToken, setHojaToken] = useState<string | null>(null);
  const [savingRuta, setSavingRuta] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [modoLink, setModoLink] = useState<"solo_ver" | "confirmar" | "confirmar_cobrar">("confirmar_cobrar");

  // Notificaciones a clientes
  const [notifSending, setNotifSending] = useState(false);
  const [notifSent, setNotifSent] = useState(false);
  const [showNotifDialog, setShowNotifDialog] = useState(false);
  const [notifSiguienteDialog, setNotifSiguienteDialog] = useState<{
    open: boolean;
    clienteNombre: string;
    clienteAuthId: string | null;
    numeroPedido: string;
    formaPago: string;
    montoPendiente: number;
    montoEfectivo: number;
  } | null>(null);
  const [notifSiguienteLoading, setNotifSiguienteLoading] = useState(false);

  const fetchVentas = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("ventas")
      .select(
        "id, numero, tipo_comprobante, fecha, forma_pago, total, subtotal, descuento_porcentaje, recargo_porcentaje, monto_pagado, estado, observacion, entregado, cliente_id, origen, metodo_entrega, cuenta_transferencia_alias, clientes(id, nombre, domicilio, localidad, telefono, saldo), venta_items(id, descripcion, cantidad, precio_unitario, subtotal, unidad_medida, unidades_por_presentacion), pedido_armado(orden_entrega, estado)"
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
      const clienteIds = [...new Set(rows.map((v) => v.cliente_id).filter(Boolean))] as string[];
      const [
        { data: movs },
        { data: ncDirect },
        { data: facturas },
        { data: ncByCliente },
        { data: cobroItems },
      ] = await Promise.all([
        supabase
          .from("caja_movimientos")
          .select("referencia_id, monto")
          .eq("tipo", "ingreso")
          .eq("referencia_tipo", "venta")
          .in("referencia_id", ventaIds),
        // Find NCs linked directly to these sales via remito_origen_id
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
        // Fallback: NCs for these clients without a remito_origen_id (unlinked NCs)
        supabase
          .from("ventas")
          .select("cliente_id, total")
          .in("cliente_id", clienteIds)
          .ilike("tipo_comprobante", "Nota de Crédito%")
          .neq("estado", "anulada")
          .is("remito_origen_id", null),
        // Cobros registrados via cobro_items (Cobranzas)
        supabase
          .from("cobro_items")
          .select("venta_id, monto_aplicado")
          .in("venta_id", ventaIds),
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
      // Sumar cobros de cobro_items (Cobranzas)
      (cobroItems || []).forEach((ci: any) => {
        if (ci.venta_id && ci.monto_aplicado > 0) {
          pagadoMap[ci.venta_id] = (pagadoMap[ci.venta_id] || 0) + ci.monto_aplicado;
        }
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
      // Fallback: assign unlinked NCs to the first pending sale for that client
      if (ncByCliente && ncByCliente.length > 0) {
        const firstSaleByCliente: Record<string, string> = {};
        rows.forEach((v) => { if (v.cliente_id && !firstSaleByCliente[v.cliente_id]) firstSaleByCliente[v.cliente_id] = v.id; });
        (ncByCliente as any[]).forEach((nc: any) => {
          const saleId = firstSaleByCliente[nc.cliente_id];
          if (saleId) {
            pagadoMap[saleId] = (pagadoMap[saleId] || 0) + (nc.total || 0);
            ncMap[saleId] = (ncMap[saleId] || 0) + (nc.total || 0);
          }
        });
      }
      setPagadoPorVenta(pagadoMap);
      setNcPorVenta(ncMap);
    } else {
      setPagadoPorVenta({});
      setNcPorVenta({});
    }

    // Initialize order sequence, preferring saved order from hoja_ruta_items
    const saved = savedOrdenRef.current;
    const newOrden: Record<string, number> = {};
    // Find the max saved orden to append new ventas after it
    const maxSaved = Object.values(saved).length > 0 ? Math.max(...Object.values(saved)) : 0;
    let nextOrden = maxSaved + 1;
    // For ventas not yet saved, sort by pedido_armado.orden_entrega (if available) before assigning sequential numbers
    const unsavedRows = rows.filter((v) => saved[v.id] === undefined && orden[v.id] === undefined);
    const unsavedSorted = [...unsavedRows].sort((a, b) => {
      const oa = a.pedido_armado?.orden_entrega ?? null;
      const ob = b.pedido_armado?.orden_entrega ?? null;
      if (oa !== null && ob !== null) return oa - ob;
      if (oa !== null) return -1;
      if (ob !== null) return 1;
      return 0;
    });
    const unsavedOrderMap: Record<string, number> = {};
    unsavedSorted.forEach((v) => { unsavedOrderMap[v.id] = nextOrden++; });
    rows.forEach((v) => {
      if (saved[v.id] !== undefined) {
        newOrden[v.id] = saved[v.id];
      } else if (orden[v.id] !== undefined) {
        newOrden[v.id] = orden[v.id];
      } else {
        newOrden[v.id] = unsavedOrderMap[v.id];
      }
    });
    setOrden(newOrden);

    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, showAllPending]);

  useEffect(() => {
    fetchVentas();
  }, [fetchVentas]);

  // Check if there's an existing active hoja de ruta and load saved order
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("hoja_ruta")
        .select("id, token_fijo, modo_link")
        .eq("estado", "activa")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) {
        setHojaRutaId(data.id);
        setHojaToken(data.token_fijo);
        if (data.modo_link) setModoLink(data.modo_link);

        // Load saved order from hoja_ruta_items
        const { data: items } = await supabase
          .from("hoja_ruta_items")
          .select("venta_id, orden")
          .eq("hoja_ruta_id", data.id)
          .order("orden");
        if (items && items.length > 0) {
          const saved: Record<string, number> = {};
          items.forEach((item: any) => { saved[item.venta_id] = item.orden; });
          savedOrdenRef.current = saved;
          setSavedOrdenLoaded(true);
          setOrden((prev) => {
            const merged = { ...prev };
            for (const [k, v] of Object.entries(saved)) { merged[k] = v; }
            return merged;
          });
        } else {
          setSavedOrdenLoaded(true);
        }
      }
    })();
  }, []);

  const fetchHistorial = useCallback(async () => {
    setHistorialLoading(true);
    const nextDay = new Date(historialDateTo + "T12:00:00");
    nextDay.setDate(nextDay.getDate() + 1);
    const endDate = nextDay.toISOString().split("T")[0];

    const { data, error } = await supabase
      .from("ventas")
      .select(
        "id, numero, tipo_comprobante, fecha, forma_pago, total, subtotal, descuento_porcentaje, recargo_porcentaje, monto_pagado, estado, observacion, entregado, cliente_id, origen, metodo_entrega, cuenta_transferencia_alias, clientes(id, nombre, domicilio, localidad, telefono, saldo), venta_items(id, descripcion, cantidad, precio_unitario, subtotal, unidad_medida, unidades_por_presentacion)"
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
      const [{ data: movs }, { data: cobroSaldoMovs }, { data: ncDirect }, { data: facturas }] = await Promise.all([
        supabase
          .from("caja_movimientos")
          .select("referencia_id, monto, metodo_pago, cuenta_bancaria, created_at")
          .eq("tipo", "ingreso")
          .eq("referencia_tipo", "venta")
          .in("referencia_id", ventaIds),
        supabase
          .from("caja_movimientos")
          .select("referencia_id, monto, metodo_pago, cuenta_bancaria, created_at")
          .eq("referencia_tipo", "cobro_saldo")
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

      const pagosMap: Record<string, { monto: number; metodo: string; cuenta_bancaria?: string; fecha_hora?: string }[]> = {};
      (movs || []).forEach((m: any) => {
        if (!pagosMap[m.referencia_id]) pagosMap[m.referencia_id] = [];
        pagosMap[m.referencia_id].push({ monto: m.monto, metodo: m.metodo_pago, cuenta_bancaria: m.cuenta_bancaria || undefined, fecha_hora: m.created_at || undefined });
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
      // Add cobro saldo anterior entries
      (cobroSaldoMovs || []).forEach((cs: any) => {
        if (!pagosMap[cs.referencia_id]) pagosMap[cs.referencia_id] = [];
        pagosMap[cs.referencia_id].push({ monto: Math.abs(cs.monto), metodo: "Cobro saldo anterior", cuenta_bancaria: cs.cuenta_bancaria || undefined, fecha_hora: cs.created_at || undefined });
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

  // Breakdown by payment method + bank account
  const historialBreakdown = (() => {
    let efectivo = 0;
    let cuentaCorriente = 0;
    const transferencias: Record<string, number> = {};
    let deudores: { nombre: string; monto: number }[] = [];

    for (const v of filteredHistorial) {
      const pagos = historialPagos[v.id] || [];
      const cobradoSinNC = pagos.filter(p => !p.metodo.includes("Nota de Cr")).reduce((a, p) => a + p.monto, 0);
      const ncMonto = pagos.filter(p => p.metodo.includes("Nota de Cr")).reduce((a, p) => a + p.monto, 0);
      const debe = v.total - cobradoSinNC; // v.total already net of NC
      if (debe > 0) deudores.push({ nombre: v.clientes?.nombre || "Sin cliente", monto: debe });

      for (const p of pagos) {
        if (p.metodo.includes("Nota de Cr")) continue;
        if (p.metodo === "Efectivo") efectivo += p.monto;
        else if (p.metodo === "Cuenta Corriente") cuentaCorriente += p.monto;
        else if (p.metodo === "Transferencia") {
          const key = (p as any).cuenta_bancaria || "Sin cuenta";
          transferencias[key] = (transferencias[key] || 0) + p.monto;
        } else {
          efectivo += p.monto; // Other methods count as cash
        }
      }
    }
    const totalTransferencias = Object.values(transferencias).reduce((s, v) => s + v, 0);
    return { efectivo, totalTransferencias, transferencias, cuentaCorriente, deudores };
  })();

  // Group historial by day, sorted by delivery time (earliest first)
  const historialByDay = (() => {
    const map: Record<string, VentaRow[]> = {};
    for (const v of filteredHistorial) {
      const day = v.fecha;
      if (!map[day]) map[day] = [];
      map[day].push(v);
    }
    // Sort each day's ventas by delivery time (payment timestamp or completado_at from hoja_ruta), earliest first
    for (const ventas of Object.values(map)) {
      ventas.sort((a, b) => {
        const aTime = (historialPagos[a.id] || []).find(p => !p.metodo.includes("Nota de Cr") && p.fecha_hora)?.fecha_hora || "";
        const bTime = (historialPagos[b.id] || []).find(p => !p.metodo.includes("Nota de Cr") && p.fecha_hora)?.fecha_hora || "";
        if (!aTime && !bTime) return 0;
        if (!aTime) return 1;
        if (!bTime) return -1;
        return new Date(aTime).getTime() - new Date(bTime).getTime();
      });
    }
    // Sort days descending
    return Object.entries(map).sort(([a], [b]) => b.localeCompare(a));
  })();

  const exportHistorialPDF = async () => {
    const { jsPDF } = await import("jspdf");
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const w = pdf.internal.pageSize.getWidth();
    const margin = 15;
    let y = 20;
    const fmtCur = formatCurrency;

    // Header
    pdf.setFontSize(18);
    pdf.setFont("helvetica", "bold");
    pdf.text("Resumen de Entregas", margin, y);
    y += 8;
    pdf.setFontSize(10);
    pdf.setFont("helvetica", "normal");
    const fromLabel = new Date(historialDateFrom + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
    const toLabel = new Date(historialDateTo + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
    pdf.text(`Período: ${fromLabel} — ${toLabel}`, margin, y);
    y += 5;
    pdf.text(`${filteredHistorial.length} entrega${filteredHistorial.length !== 1 ? "s" : ""}`, margin, y);
    y += 10;

    // General summary
    const totalNeto = historialTotalVentas - historialTotalNC;
    const totalPendiente = totalNeto - historialTotalCobrado;

    pdf.setFontSize(12);
    pdf.setFont("helvetica", "bold");
    pdf.text("Resumen General", margin, y);
    y += 7;
    pdf.setFontSize(10);
    pdf.setFont("helvetica", "normal");
    const summaryRows = [
      ["Total Ventas", fmtCur(historialTotalVentas)],
      ...(historialTotalNC > 0 ? [["Notas de Crédito", `-${fmtCur(historialTotalNC)}`]] : []),
      ["Neto", fmtCur(totalNeto)],
      ["Cobrado", fmtCur(historialTotalCobrado)],
      ...(totalPendiente > 0 ? [["Pendiente de Cobro", fmtCur(totalPendiente)]] : []),
    ];
    for (const [label, val] of summaryRows) {
      pdf.text(label, margin, y);
      pdf.text(val, w - margin, y, { align: "right" });
      y += 5;
    }
    y += 5;

    // Payment method breakdown
    pdf.setDrawColor(200);
    pdf.line(margin, y, w - margin, y);
    y += 5;
    pdf.setFontSize(12);
    pdf.setFont("helvetica", "bold");
    pdf.text("Desglose por Método de Pago", margin, y);
    y += 7;
    pdf.setFontSize(10);
    pdf.setFont("helvetica", "normal");

    if (historialBreakdown.efectivo > 0) {
      pdf.text("Efectivo", margin + 5, y);
      pdf.text(fmtCur(historialBreakdown.efectivo), w - margin, y, { align: "right" });
      y += 5;
    }
    if (historialBreakdown.totalTransferencias > 0) {
      pdf.text("Transferencia", margin + 5, y);
      pdf.text(fmtCur(historialBreakdown.totalTransferencias), w - margin, y, { align: "right" });
      y += 5;
      pdf.setFontSize(9);
      for (const [cuenta, monto] of Object.entries(historialBreakdown.transferencias).sort((a, b) => b[1] - a[1])) {
        pdf.text(`→ ${cuenta}`, margin + 10, y);
        pdf.text(fmtCur(monto), w - margin, y, { align: "right" });
        y += 4;
      }
      pdf.setFontSize(10);
    }
    if (historialBreakdown.cuentaCorriente > 0) {
      pdf.text("Cuenta Corriente", margin + 5, y);
      pdf.text(fmtCur(historialBreakdown.cuentaCorriente), w - margin, y, { align: "right" });
      y += 5;
    }
    y += 5;

    // Deliveries table grouped by day
    pdf.setDrawColor(200);
    pdf.line(margin, y, w - margin, y);
    y += 5;
    pdf.setFontSize(12);
    pdf.setFont("helvetica", "bold");
    pdf.text("Detalle de Entregas", margin, y);
    y += 7;

    for (const [day, dayVentas] of historialByDay) {
      if (y > 255) { pdf.addPage(); y = 20; }

      const dayLabel = new Date(day + "T12:00:00").toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
      const dayTotal = dayVentas.reduce((s, v) => s + v.total, 0);

      // Day subheader
      pdf.setFillColor(245, 245, 245);
      pdf.rect(margin, y - 4, w - margin * 2, 6, "F");
      pdf.setFontSize(10);
      pdf.setFont("helvetica", "bold");
      pdf.text(dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1), margin + 2, y);
      pdf.text(fmtCur(dayTotal), w - margin - 2, y, { align: "right" });
      y += 5;

      // Columnas ajustadas para A4 (w=210, margin=15, útil=180mm)
      const COL = {
        num:     margin,        // N°       — hasta col+18
        cliente: margin + 18,   // Cliente  — hasta col+44 (26mm)
        pago:    margin + 64,   // Pago     — hasta col+100 (36mm) — más espacio para banco
        total:   margin + 130,  // Total    — align right
        cobrado: margin + 152,  // Cobrado  — align right
        debe:    margin + 168,  // Debe     — align right
        hora:    w - margin,    // Hora     — align right
      };
      pdf.setFontSize(7.5);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(100);
      pdf.text("N", COL.num, y);
      pdf.text("Cliente", COL.cliente, y);
      pdf.text("Pago / Cuenta", COL.pago, y);
      pdf.text("Total", COL.total, y, { align: "right" });
      pdf.text("Cobrado", COL.cobrado, y, { align: "right" });
      pdf.text("Debe", COL.debe, y, { align: "right" });
      pdf.text("Hora", COL.hora, y, { align: "right" });
      y += 3.5;
      pdf.setTextColor(0);
      pdf.setDrawColor(200);
      pdf.line(margin, y - 1, w - margin, y - 1);

      for (const v of dayVentas) {
        const pagos = historialPagos[v.id] || [];
        const pagosSinNC = pagos.filter(p => !p.metodo.includes("Nota de Cr"));
        const cobradoSinNC = pagosSinNC.reduce((a, p) => a + p.monto, 0);
        const ncMonto = pagos.filter(p => p.metodo.includes("Nota de Cr")).reduce((a, p) => a + p.monto, 0);
        const neto = v.total; // v.total already net of NC
        const debe = Math.max(0, neto - cobradoSinNC);

        // Hora del primer pago
        const firstPagoConHora = pagosSinNC.find(p => (p as any).fecha_hora);
        const horaEntrega = firstPagoConHora ? (() => {
          const d = new Date((firstPagoConHora as any).fecha_hora);
          return isNaN(d.getTime()) ? "--:--" : d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Argentina/Buenos_Aires" });
        })() : "--:--";

        // Armar líneas de pago (solo texto ASCII para evitar símbolos raros)
        type PagoLine = { text: string; color: [number, number, number]; indent: number };
        const pagoLines: PagoLine[] = [];
        if (pagosSinNC.length === 0) {
          pagoLines.push({ text: "Sin cobro registrado", color: [156, 163, 175], indent: 0 });
        } else {
          for (const p of pagosSinNC) {
            const colorMetodo: [number, number, number] = p.metodo === "Transferencia" ? [37, 99, 235] : [22, 101, 52];
            pagoLines.push({ text: `${p.metodo} ${fmtCur(p.monto)}`, color: colorMetodo, indent: 0 });
            if (p.metodo === "Transferencia" && (p as any).cuenta_bancaria) {
              // Usar ">" en lugar de "→" para evitar problemas de encoding en jsPDF
              const cuentaLabel = `> ${String((p as any).cuenta_bancaria).substring(0, 28)}`;
              pagoLines.push({ text: cuentaLabel, color: [59, 130, 246], indent: 2 });
            }
          }
        }
        if (ncMonto > 0) {
          pagoLines.push({ text: `NC -${fmtCur(ncMonto)}`, color: [180, 83, 9], indent: 0 });
        }

        const lineH = 3.6;
        const rowHeight = Math.max(5.5, pagoLines.length * lineH + 1.5);

        if (y + rowHeight > 275) { pdf.addPage(); y = 20; }

        // N°
        pdf.setFontSize(7);
        pdf.setFont("helvetica", "normal");
        pdf.setTextColor(130);
        pdf.text((v.numero || "").slice(-7), COL.num, y);

        // Cliente
        pdf.setFontSize(7.5);
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(0);
        pdf.text((v.clientes?.nombre || "Sin cliente").substring(0, 22), COL.cliente, y);
        pdf.setFont("helvetica", "normal");

        // Líneas de pago
        let lineY = y;
        for (const pl of pagoLines) {
          pdf.setFontSize(7);
          pdf.setTextColor(...pl.color);
          pdf.text(pl.text, COL.pago + pl.indent, lineY);
          lineY += lineH;
        }

        // Total
        pdf.setFontSize(7.5);
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(0);
        pdf.text(fmtCur(neto), COL.total, y, { align: "right" });
        pdf.setFont("helvetica", "normal");

        // Cobrado
        if (cobradoSinNC > 0) {
          pdf.setTextColor(22, 101, 52);
          pdf.text(fmtCur(cobradoSinNC), COL.cobrado, y, { align: "right" });
        } else {
          pdf.setTextColor(180, 180, 180);
          pdf.text("$0", COL.cobrado, y, { align: "right" });
        }

        // Debe
        if (debe > 0) {
          pdf.setTextColor(194, 65, 12);
          pdf.setFont("helvetica", "bold");
          pdf.text(fmtCur(debe), COL.debe, y, { align: "right" });
          pdf.setFont("helvetica", "normal");
        } else {
          pdf.setTextColor(180, 180, 180);
          pdf.text("-", COL.debe, y, { align: "right" });
        }

        // Hora — separada en columna propia
        pdf.setFontSize(7);
        pdf.setTextColor(120, 120, 120);
        pdf.text(horaEntrega, COL.hora, y, { align: "right" });

        pdf.setTextColor(0);
        y += rowHeight + 0.5;
      }
      y += 4;
    }

    // Deudores section
    if (historialBreakdown.deudores.length > 0) {
      if (y > 250) { pdf.addPage(); y = 20; }
      pdf.setDrawColor(200);
      pdf.line(margin, y, w - margin, y);
      y += 5;
      pdf.setFontSize(12);
      pdf.setFont("helvetica", "bold");
      pdf.text(`Deudores Pendientes (${historialBreakdown.deudores.length})`, margin, y);
      y += 7;
      pdf.setFontSize(10);
      pdf.setFont("helvetica", "normal");

      for (const d of historialBreakdown.deudores.sort((a, b) => b.monto - a.monto)) {
        if (y > 275) { pdf.addPage(); y = 20; }
        pdf.text(d.nombre, margin + 5, y);
        pdf.setTextColor(200, 100, 0);
        pdf.text(fmtCur(d.monto), w - margin, y, { align: "right" });
        pdf.setTextColor(0);
        y += 5;
      }
      y += 3;
      pdf.setFont("helvetica", "bold");
      pdf.text("Total Pendiente:", margin + 5, y);
      pdf.text(fmtCur(historialBreakdown.deudores.reduce((s, d) => s + d.monto, 0)), w - margin, y, { align: "right" });
    }

    // Footer
    y += 10;
    pdf.setFontSize(8);
    pdf.setTextColor(150);
    pdf.text(`Generado el ${new Date().toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })} a las ${nowTimeARG().substring(0, 5)}`, margin, y);

    pdf.save(`entregas-${historialDateFrom}-a-${historialDateTo}.pdf`);
  };

  const handleMarkDelivered = async (groupVentas: VentaRow[]) => {
    const ids = groupVentas.map((v) => v.id);
    const totalPendiente = groupVentas.reduce((s, v) => s + Math.max(0, v.total - ((pagadoPorVenta[v.id] || 0) - (ncPorVenta[v.id] || 0))), 0);
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
        const ventaDeuda = Math.max(
          0,
          venta.total - ((pagadoPorVenta[venta.id] || 0) - (ncPorVenta[venta.id] || 0))
        );
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
    // Buscar el siguiente cliente en la ruta antes de remover el actual
    const grupoActualIdx = clientGroups.findIndex(g =>
      g.ventas.some(v => ids.includes(v.id))
    );
    const siguienteGrupo = clientGroups[grupoActualIdx + 1];

    if (siguienteGrupo && siguienteGrupo.ventas.length > 0) {
      const ventaSiguiente = siguienteGrupo.ventas[0];
      if (ventaSiguiente.numero) {
        const { data: ptSiguiente } = await supabase
          .from("pedidos_tienda")
          .select("cliente_auth_id, metodo_pago, monto_efectivo, total")
          .eq("numero", ventaSiguiente.numero)
          .maybeSingle();

        // Calcular monto pendiente en efectivo
        const formaPago = ptSiguiente?.metodo_pago || ventaSiguiente.forma_pago || "";
        const montoPendiente = Math.max(0, ventaSiguiente.total - (pagadoPorVenta[ventaSiguiente.id] || 0));
        const montoEfectivo = formaPago.toLowerCase() === "mixto"
          ? (ptSiguiente?.monto_efectivo || 0)
          : formaPago.toLowerCase() === "efectivo" ? montoPendiente : 0;

        setNotifSiguienteDialog({
          open: true,
          clienteNombre: siguienteGrupo.cliente?.nombre || "el siguiente cliente",
          clienteAuthId: ptSiguiente?.cliente_auth_id || null,
          numeroPedido: ventaSiguiente.numero,
          formaPago,
          montoPendiente,
          montoEfectivo,
        });
      }
    }

    setVentas((prev) => prev.filter((v) => !ids.includes(v.id)));
  };

  const handleViewDetail = async (venta: VentaRow) => {
    setDetailVenta(venta);
    setDetailPagos([]);
    setDetailOpen(true);
    const [{ data: movs }, { data: cobroSaldoMovs }, { data: ncDirect }, { data: facturas }] = await Promise.all([
      supabase.from("caja_movimientos").select("metodo_pago, monto, tipo, cuenta_bancaria, created_at").eq("referencia_id", venta.id).eq("referencia_tipo", "venta").eq("tipo", "ingreso"),
      supabase.from("caja_movimientos").select("metodo_pago, monto, descripcion, cuenta_bancaria, created_at").eq("referencia_id", venta.id).eq("referencia_tipo", "cobro_saldo"),
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
    const pagos: { metodo: string; monto: number; cuenta_bancaria?: string | null; fecha_hora?: string | null }[] = [];
    if (movs && movs.length > 0) {
      pagos.push(...movs.map((m: any) => ({ metodo: m.metodo_pago, monto: Math.abs(m.monto), cuenta_bancaria: m.cuenta_bancaria, fecha_hora: m.created_at })));
    } else if (venta.forma_pago) {
      pagos.push({ metodo: venta.forma_pago, monto: venta.total });
    }
    // Add NC refunds as settled amount (direct + via facturas)
    const ncTotal = [...(ncDirect || []), ...ncViaFactura].reduce((s: number, nc: any) => s + (nc.total || 0), 0);
    if (ncTotal > 0) {
      pagos.push({ metodo: "Nota de Crédito (devolución)", monto: ncTotal });
    }
    // Add cobro saldo anterior entries
    if (cobroSaldoMovs && cobroSaldoMovs.length > 0) {
      for (const cs of cobroSaldoMovs) {
        pagos.push({ metodo: `Cobro saldo anterior`, monto: Math.abs(cs.monto), cuenta_bancaria: cs.cuenta_bancaria, fecha_hora: cs.created_at });
      }
    }
    setDetailPagos(pagos);
  };

  // Payment dialog state
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [payVenta, setPayVenta] = useState<VentaRow | null>(null);
  const [payDefaultEfectivo, setPayDefaultEfectivo] = useState<number | undefined>();
  const [payDefaultTransferencia, setPayDefaultTransferencia] = useState<number | undefined>();
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
    // v.total already has NC deducted; pagadoPorVenta includes NC as "payment" — subtract NC from pagado
    const totalDebe = allVentas.reduce((s, vt) => {
      const pagadoReal = Math.max(0, (pagadoPorVenta[vt.id] || 0) - (ncPorVenta[vt.id] || 0));
      return s + Math.max(0, vt.total - pagadoReal);
    }, 0);
    setPayVenta(v);
    const metodoOriginal = v.forma_pago === "Transferencia" ? "Transferencia" : v.forma_pago === "Mixto" ? "Mixto" : "Efectivo";
    setPayMetodo(metodoOriginal);
    setPayMonto(totalDebe);

    // Pre-fill amounts from pedidos_tienda if it's a Mixto online order
    let ptEf: number = 0;
    let ptTr: number = 0;
    if (metodoOriginal === "Mixto" && v.numero) {
      const { data: pt } = await supabase.from("pedidos_tienda").select("monto_efectivo, monto_transferencia").eq("numero", v.numero).maybeSingle();
      if (pt && (pt.monto_efectivo > 0 || pt.monto_transferencia > 0)) {
        ptEf = pt.monto_efectivo || 0;
        ptTr = pt.monto_transferencia || 0;
        setPayEfectivo(ptEf);
        setPayTransferencia(ptTr);
      } else {
        setPayEfectivo(Math.floor(totalDebe / 2));
        setPayTransferencia(totalDebe - Math.floor(totalDebe / 2));
      }
    } else {
      setPayEfectivo(metodoOriginal === "Mixto" ? Math.floor(totalDebe / 2) : totalDebe);
      setPayTransferencia(metodoOriginal === "Mixto" ? totalDebe - Math.floor(totalDebe / 2) : 0);
    }
    // Also set defaults for CobroVentaSection
    setPayDefaultEfectivo(ptEf || undefined);
    setPayDefaultTransferencia(ptTr || undefined);

    setPayCuentaBancariaId("");
    setPayDialogOpen(true);
  };

  // handleRegistrarPago removed — replaced by CobroVentaSection onConfirmar

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

  const saveAndShareRuta = async () => {
    setSavingRuta(true);
    try {
      const ventaIds = filteredVentas.map((v) => v.id);
      if (ventaIds.length === 0) { setSavingRuta(false); return; }

      // Build ordered list of venta IDs based on current clientGroups order
      const orderedVentaIds: { venta_id: string; orden: number }[] = [];
      let counter = 1;
      for (const group of clientGroups) {
        for (const v of group.ventas) {
          if (ventaIds.includes(v.id)) {
            orderedVentaIds.push({ venta_id: v.id, orden: counter });
          }
        }
        counter++;
      }

      if (hojaRutaId) {
        // Update existing hoja — generate token if missing
        let currentToken = hojaToken;
        if (!currentToken) {
          currentToken = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
          setHojaToken(currentToken);
        }
        await supabase.from("hoja_ruta").update({ modo_link: modoLink, token_fijo: currentToken }).eq("id", hojaRutaId);
        // Delete old items and re-insert with new order
        await supabase.from("hoja_ruta_items").delete().eq("hoja_ruta_id", hojaRutaId);
        await supabase.from("hoja_ruta_items").insert(
          orderedVentaIds.map((item) => ({
            hoja_ruta_id: hojaRutaId,
            venta_id: item.venta_id,
            orden: item.orden,
          }))
        );
        setShowShareDialog(true);
      } else {
        // Create new hoja
        const token = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
        const { data: hoja, error } = await supabase.from("hoja_ruta").insert({
          fecha: selectedDate || getArgentinaToday(),
          nombre: `Ruta ${new Date().toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" })}`,
          estado: "activa",
          modo_link: modoLink,
          token_fijo: token,
        }).select("id, token_fijo").single();

        if (error || !hoja) {
          console.error("Error creating hoja:", error);
          setSavingRuta(false);
          return;
        }

        // Insert items
        await supabase.from("hoja_ruta_items").insert(
          orderedVentaIds.map((item) => ({
            hoja_ruta_id: hoja.id,
            venta_id: item.venta_id,
            orden: item.orden,
          }))
        );

        setHojaRutaId(hoja.id);
        setHojaToken(hoja.token_fijo);
        setShowShareDialog(true);
      }
    } catch (err) {
      console.error("Error saving ruta:", err);
    }
    setSavingRuta(false);
  };

  const enviarNotificacionesRuta = async () => {
    const clienteIds = [...new Set(filteredVentas.map((v) => v.cliente_id).filter(Boolean))] as string[];
    if (clienteIds.length === 0) {
      return;
    }
    setNotifSending(true);
    try {
      const res = await fetch("/api/notificaciones/enviar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo: "Tu pedido esta en camino",
          mensaje: "Tu pedido esta siendo enviado. Pronto lo recibiras!",
          tipo: "pedido",
          url: "/cuenta/pedidos",
          segmentacion: { tipo: "clientes_ids", valor: clienteIds.map(Number) },
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      setNotifSent(true);
    } catch (err) {
      console.error("Error sending notifications:", err);
    } finally {
      setNotifSending(false);
    }
  };

  const enviarNotifSiguiente = async () => {
    if (!notifSiguienteDialog?.clienteAuthId) return;
    setNotifSiguienteLoading(true);

    const nombre = notifSiguienteDialog.clienteNombre;
    const primerNombre = nombre.trim().split(" ")[0];

    const { titulo, mensaje } = buildNotifMensaje({
      tipo: "envio",
      primerNombre,
      formaPago: notifSiguienteDialog.formaPago,
      montoPendiente: notifSiguienteDialog.montoPendiente,
      montoEfectivo: notifSiguienteDialog.montoEfectivo,
    });

    try {
      await fetch("/api/notificaciones/enviar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo,
          mensaje,
          tipo: "pedido",
          url: "/cuenta/pedidos",
          segmentacion: {
            tipo: "cliente",
            valor: Number(notifSiguienteDialog.clienteAuthId),
          },
        }),
      });
    } catch {
      console.error("Error enviando notificacion al siguiente");
    } finally {
      setNotifSiguienteLoading(false);
      setNotifSiguienteDialog(null);
    }
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
  // v.total in DB is already adjusted by NC (original - NC = v.total).
  // ncPorVenta tracks the NC amount. pagadoPorVenta includes NC as a "payment".
  // To avoid double-counting: reconstruct original bruto by adding NC back.
  const groupTotals = (g: ClientGroup) => {
    const nc = g.ventas.reduce((s, v) => s + (ncPorVenta[v.id] || 0), 0);
    const bruto = g.ventas.reduce((s, v) => s + v.total + (ncPorVenta[v.id] || 0), 0); // original total before NC
    const neto = bruto - nc; // = sum of v.total (what client actually owes)
    const pagadoTotal = g.ventas.reduce((s, v) => s + (pagadoPorVenta[v.id] || 0), 0);
    const pagadoSinNC = pagadoTotal - nc; // Real payments only (without NC)
    const debe = Math.max(0, neto - pagadoSinNC);
    return { bruto, nc, pagado: pagadoSinNC, neto, debe };
  };

  // Stats (from filtered)
  const totalPedidos = clientGroups.length;
  const totalNC = filteredVentas.reduce((s, v) => s + (ncPorVenta[v.id] || 0), 0);
  const valorTotal = filteredVentas.reduce((s, v) => s + v.total + (ncPorVenta[v.id] || 0), 0); // original totals
  const valorNeto = valorTotal - totalNC; // after NC = sum of v.total
  const totalYaPagadoRaw = filteredVentas.reduce((s, v) => s + (pagadoPorVenta[v.id] || 0), 0);
  const totalYaPagado = totalYaPagadoRaw - totalNC; // real payments only
  const totalACobrar = Math.max(0, valorNeto - totalYaPagado);


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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 shrink-0">
            <Truck className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">Entregas y Hoja de Ruta</h1>
            <p className="text-sm text-muted-foreground hidden sm:block">Gestiona entregas pendientes, cobros y hoja de ruta</p>
          </div>
        </div>
        <div className="flex gap-2">
          {hojaToken && (
            <Button variant="outline" size="sm" onClick={() => setShowShareDialog(true)}>
              <ExternalLink className="w-4 h-4 mr-1.5" />
              <span className="hidden sm:inline">Ver link</span>
              <span className="sm:hidden">Link</span>
            </Button>
          )}
          <Button
            onClick={() => setShowNotifDialog(true)}
            disabled={notifSending || notifSent || filteredVentas.length === 0}
            variant={notifSent ? "outline" : "secondary"}
            size="sm"
          >
            {notifSent ? (
              <><CheckCircle className="w-4 h-4 mr-1.5 text-green-500" /> Notificados</>
            ) : (
              <><Bell className="w-4 h-4 mr-1.5" /> Notificar clientes</>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open("/equipo", "_blank")}
          >
            <Package className="w-4 h-4 mr-1.5" />
            Tablero de armado
          </Button>
          <Button onClick={saveAndShareRuta} disabled={savingRuta || filteredVentas.length === 0} size="sm">
            {savingRuta ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Share2 className="w-4 h-4 mr-1.5" />}
            {hojaRutaId ? "Actualizar Ruta" : "Guardar y Compartir"}
          </Button>
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
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                  <CheckCircle className="w-4 h-4" />
                  Entregas
                </div>
                <div className="text-2xl font-bold">{filteredHistorial.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                  <DollarSign className="w-4 h-4" />
                  Total
                </div>
                <div className="text-2xl font-bold">{formatCurrency(historialTotalVentas - historialTotalNC)}</div>
                {historialTotalNC > 0 && (
                  <p className="text-xs text-amber-600 mt-1">NC: -{formatCurrency(historialTotalNC)}</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-green-600 text-sm mb-1">
                  <Banknote className="w-4 h-4" />
                  Efectivo
                </div>
                <div className="text-2xl font-bold text-green-600">{formatCurrency(historialBreakdown.efectivo)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-blue-600 text-sm mb-1">
                  <Landmark className="w-4 h-4" />
                  Transferencias
                </div>
                <div className="text-2xl font-bold text-blue-600">{formatCurrency(historialBreakdown.totalTransferencias)}</div>
                {Object.entries(historialBreakdown.transferencias).map(([cuenta, monto]) => (
                  <p key={cuenta} className="text-xs text-blue-500 mt-0.5">{cuenta}: {formatCurrency(monto)}</p>
                ))}
              </CardContent>
            </Card>
            {historialBreakdown.cuentaCorriente > 0 && (
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-orange-600 text-sm mb-1">
                    <FileText className="w-4 h-4" />
                    Cuenta Corriente
                  </div>
                  <div className="text-2xl font-bold text-orange-600">{formatCurrency(historialBreakdown.cuentaCorriente)}</div>
                </CardContent>
              </Card>
            )}
            {historialBreakdown.deudores.length > 0 && (
              <Card className="border-orange-200 bg-orange-50/50">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-orange-700 text-sm mb-1">
                    <AlertCircle className="w-4 h-4" />
                    Deudores
                  </div>
                  <div className="text-2xl font-bold text-orange-700">{historialBreakdown.deudores.length}</div>
                  <div className="mt-1 space-y-0.5">
                    {historialBreakdown.deudores.map((d, i) => (
                      <p key={i} className="text-xs text-orange-600">{d.nombre}: {formatCurrency(d.monto)}</p>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Historial grouped by day */}
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Historial de Entregas</h2>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={exportHistorialPDF} disabled={historialLoading || filteredHistorial.length === 0}>
                <FileText className="w-4 h-4 mr-2" />
                Exportar PDF
              </Button>
              <Button variant="outline" size="sm" onClick={fetchHistorial} disabled={historialLoading}>
                <RefreshCw className={`w-4 h-4 mr-2 ${historialLoading ? "animate-spin" : ""}`} />
                Actualizar
              </Button>
            </div>
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
                  const debe = v.total - cobradoSinNC; // v.total already net of NC
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
                              <th className="pb-2 px-3">Pago</th>
                              <th className="pb-2 px-3">Hora</th>
                              <th className="pb-2 px-3 text-right">Acciones</th>
                            </tr>
                          </thead>
                          <tbody>
                            {dayVentas.map((venta) => {
                              const pagos = historialPagos[venta.id] || [];
                              const cobradoReal = pagos.filter(p => !p.metodo.includes("Nota de Cr")).reduce((a, p) => a + p.monto, 0);
                              const ncMonto = pagos.filter(p => p.metodo.includes("Nota de Cr")).reduce((a, p) => a + p.monto, 0);
                              const metodos = [...new Set(pagos.filter(p => !p.metodo.includes("Nota de Cr")).map((p) => p.metodo))].join(", ") || venta.forma_pago;
                              const debe = venta.total - cobradoReal; // v.total already net of NC

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
                                    {pagos.filter(p => !p.metodo.includes("Nota de Cr")).map((p, pi) => (
                                      <div key={pi} className="text-xs">
                                        <span className="font-medium">{p.metodo}</span>
                                        {" "}<span className="text-muted-foreground">{formatCurrency(p.monto)}</span>
                                        {(p as any).cuenta_bancaria && <span className="text-blue-600 ml-1">→ {(p as any).cuenta_bancaria}</span>}
                                      </div>
                                    ))}
                                    {pagos.length === 0 && <Badge variant="secondary" className="text-xs">{venta.forma_pago || "---"}</Badge>}
                                  </td>
                                  <td className="py-2.5 px-3 text-xs text-muted-foreground">
                                    {(() => {
                                      const firstPago = pagos.find(p => !p.metodo.includes("Nota de Cr") && (p as any).fecha_hora);
                                      if (!firstPago || !(firstPago as any).fecha_hora) return "—";
                                      const d = new Date((firstPago as any).fecha_hora);
                                      return isNaN(d.getTime()) ? "—" : d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Argentina/Buenos_Aires" });
                                    })()}
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
                          <span className="font-medium">{formatCurrency(v.total)}</span>
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
                                <span className="font-medium">{formatCurrency(v.total)}</span>
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
          subtotal: detailVenta.subtotal || undefined,
          recargo_porcentaje: detailVenta.recargo_porcentaje || undefined,
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
                          const d = Math.max(
                            0,
                            v.total - ((pagadoPorVenta[v.id] || 0) - (ncPorVenta[v.id] || 0))
                          );
                          return d > 0 ? (
                            <p key={v.id} className="text-xs text-amber-700">#{v.numero}: {fmtCur(d)}</p>
                          ) : null;
                        })}
                      </div>
                    )}
                    <p className="text-xs text-amber-700">Podés cobrar ahora o cargar a cuenta corriente como deuda.</p>
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
                  {dlvConfirm.type === "unpaid" && (
                    <Button variant="outline" className="border-orange-200 text-orange-700 hover:bg-orange-50" onClick={executeDlvConfirm}>
                      <FileText className="w-4 h-4 mr-1.5" />
                      Cargar a CC
                    </Button>
                  )}
                  {dlvConfirm.type === "unpaid" && (
                    <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => {
                      setDlvConfirm({ open: false, ids: [], pendiente: 0, type: "paid" });
                      openPayDialog(groupVentas[0], groupVentas);
                    }}>
                      <DollarSign className="w-4 h-4 mr-1.5" />
                      Cobrar y entregar
                    </Button>
                  )}
                  {dlvConfirm.type === "paid" && (
                    <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={executeDlvConfirm}>
                      <CheckCircle className="w-4 h-4 mr-1.5" />
                      Marcar entregado
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
            // v.total in DB already has NC deducted. Reconstruct original for display.
            const totalNCGrupo = allVentas.reduce((s, vt) => s + (ncPorVenta[vt.id] || 0), 0);
            // Real payments = pagadoPorVenta minus the NC portion
            const totalPagadoReal = allVentas.reduce((s, vt) => {
              const pagado = pagadoPorVenta[vt.id] || 0;
              const nc = ncPorVenta[vt.id] || 0;
              return s + Math.max(0, pagado - nc);
            }, 0);
            // Sum of v.total = what client actually owes (NC already applied)
            const totalNeto = allVentas.reduce((s, vt) => s + vt.total, 0);

            // Calcular subtotal SIN recargo para pasarle al CobroVentaSection.
            // vt.total puede incluir el recargo de transferencia (guardado en DB),
            // así que hay que revertirlo para que el componente no lo duplique.
            // Si hay items disponibles, usar la suma de sus subtotales (más preciso).
            // Si no, revertir matemáticamente dividiendo por (1 + recargo/100).
            const subtotalSinRecargo = allVentas.reduce((s, vt) => {
              // Preferir vt.subtotal (campo guardado en DB, siempre correcto)
              if ((vt as any).subtotal > 0) {
                return s + (vt as any).subtotal;
              }
              // Fallback: sumar subtotales de items si están cargados
              const items = vt.venta_items;
              if (items && items.length > 0) {
                return s + items.reduce((acc, item) => acc + (item.subtotal || 0), 0);
              }
              // Último fallback: revertir recargo matemáticamente
              const fp = (vt.forma_pago || "").toLowerCase();
              const tieneRecargo = fp === "transferencia" && porcentajeTransferencia > 0;
              return s + (tieneRecargo
                ? Math.round((vt.total / (1 + porcentajeTransferencia / 100)) * 100) / 100
                : vt.total);
            }, 0);

            // preDebeGrupo = what client owes (v.total sum, already net of NC) minus real payments
            const preDebeGrupo = Math.max(0, totalNeto - totalPagadoReal);
            return (
              <div className="space-y-4">
                {/* Summary header */}
                <div className="text-sm space-y-1 bg-gray-50 rounded-lg p-3">
                  <div className="flex justify-between"><span className="text-gray-500">Cliente</span><span className="font-medium">{payVenta.clientes?.nombre || "—"}</span></div>
                  {allVentas.length === 1 ? (
                    <>
                      <div className="flex justify-between"><span className="text-gray-500">Venta</span><span className="font-mono font-medium">{payVenta.numero}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">Total</span><span className="font-bold">{formatCurrency(allVentas[0].total + (ncPorVenta[allVentas[0].id] || 0))}</span></div>
                      {(ncPorVenta[allVentas[0].id] || 0) > 0 && (
                        <div className="flex justify-between"><span className="text-red-600">Nota de Crédito</span><span className="text-red-600 font-medium">-{formatCurrency(ncPorVenta[allVentas[0].id])}</span></div>
                      )}
                    </>
                  ) : (
                    <>
                      {allVentas.map((v) => (
                        <div key={v.id} className="flex justify-between">
                          <span className="text-gray-500">#{v.numero}</span>
                          <span className="font-medium">{formatCurrency(v.total + (ncPorVenta[v.id] || 0))}</span>
                        </div>
                      ))}
                      {totalNCGrupo > 0 && <div className="flex justify-between"><span className="text-red-600">Nota de Crédito</span><span className="text-red-600 font-medium">-{formatCurrency(totalNCGrupo)}</span></div>}
                      <div className="flex justify-between border-t pt-1 mt-1"><span className="text-gray-500">Total combinado</span><span className="font-bold">{formatCurrency(totalNeto)}</span></div>
                    </>
                  )}
                  {totalPagadoReal > 0 && <div className="flex justify-between"><span className="text-gray-500">Ya pagado</span><span className="text-emerald-600">{formatCurrency(totalPagadoReal)}</span></div>}
                  <div className="flex justify-between border-t pt-1 mt-1"><span className="text-gray-500 font-medium">Debe</span><span className="text-orange-600 font-bold">{formatCurrency(preDebeGrupo)}</span></div>
                </div>

                {/* CobroVentaSection — same as listado detail */}
                <CobroVentaSection
                  ventaId={payVenta.id}
                  clienteId={payVenta.cliente_id || ""}
                  clienteNombre={payVenta.clientes?.nombre || ""}
                  clienteSaldo={payVenta.clientes?.saldo || 0}
                  montoVenta={preDebeGrupo}
                  subtotalItems={subtotalSinRecargo}
                  costoEnvio={0}
                  recargoTransferencia={porcentajeTransferencia}
                  cuentasBancarias={cuentasBancarias.map(c => ({ id: c.id, nombre: c.nombre, alias: (c as any).alias || "" }))}
                  defaultMetodo={payVenta.forma_pago}
                  defaultEfectivo={payDefaultEfectivo}
                  defaultTransferencia={payDefaultTransferencia}
                  defaultCuentaAlias={(payVenta as any).cuenta_transferencia_alias}
                  onConfirmar={async (result: CobroVentaResult) => {
                    const hoy = getArgentinaToday();
                    const hora = nowTimeARG();
                    const clienteNombre = payVenta.clientes?.nombre || "";
                    const cuentaNombre = result.cuentaBancaria;

                    // Guard: check venta is not anulada
                    const { data: ventaEstadoCheck } = await supabase.from("ventas").select("estado").eq("id", payVenta.id).single();
                    if (ventaEstadoCheck?.estado === "anulada") {
                      alert("No se puede cobrar una venta anulada");
                      return;
                    }

                    // Idempotency guard: prevent double cobro
                    const ventaIdsToCheck = allVentas.map(v => v.id);
                    const { count: existingCobros } = await supabase
                      .from("caja_movimientos")
                      .select("id", { count: "exact", head: true })
                      .in("referencia_id", ventaIdsToCheck)
                      .eq("referencia_tipo", "venta");
                    if (existingCobros && existingCobros > 0) {
                      alert("Estas ventas ya tienen cobro registrado. No se puede duplicar el pago.");
                      setPayDialogOpen(false);
                      fetchVentas();
                      return;
                    }

                    // Distribute REAL payment across ventas FIFO
                    // Only count actual money received (efectivo + transferencia + surcharge).
                    // CC portion is DEBT (goes to saldo), NOT payment — don't include in monto_pagado.
                    // Subtract saldo allocation from cash — that money pays old debt, not this venta.
                    const realCashCollected = (result.efectivo || 0) + (result.transferencia || 0) + (result.surcharge || 0);
                    const totalCollected = realCashCollected;
                    let remaining = totalCollected;
                    const perVenta: { venta: VentaRow; paid: number; debtLeft: number }[] = [];
                    for (const v of allVentas) {
                      // Use totalCollected as deuda cap when surcharge applies (so the surcharge fits)
                      const pagadoReal = Math.max(0, (pagadoPorVenta[v.id] || 0) - (ncPorVenta[v.id] || 0));
                      const storedTotal = v.total - pagadoReal;
                      const surchargeForVenta = result.surcharge > 0 && allVentas.length === 1
                        ? (result.surcharge || 0) : 0;
                      const deuda = Math.max(0, storedTotal + surchargeForVenta);
                      const pays = Math.min(remaining, deuda);
                      perVenta.push({ venta: v, paid: pays, debtLeft: deuda - pays });
                      remaining = Math.round((remaining - pays) * 100) / 100;
                    }

                    // Register caja entries per venta
                    for (const { venta, paid } of perVenta) {
                      if (paid <= 0 && result.metodo !== "Cuenta Corriente") continue;
                      if (result.metodo === "Mixto") {
                        // Use original amounts (not proportional ratio) — cap at paid
                        const efForVenta = Math.min(result.efectivo || 0, paid);
                        const trWithSurcharge = (result.transferencia || 0) + (result.surcharge || 0);
                        const trForVenta = Math.min(trWithSurcharge, Math.max(0, paid - efForVenta));
                        if (efForVenta > 0) {
                          await supabase.from("caja_movimientos").insert({ fecha: hoy, hora, tipo: "ingreso", descripcion: `Cobro entrega #${venta.numero} (Efectivo) — ${clienteNombre}`, metodo_pago: "Efectivo", monto: efForVenta, referencia_id: venta.id, referencia_tipo: "venta" });
                        }
                        if (trForVenta > 0) {
                          await supabase.from("caja_movimientos").insert({ fecha: hoy, hora, tipo: "ingreso", descripcion: `Cobro entrega #${venta.numero} (Transferencia${result.surcharge > 0 ? ` +${porcentajeTransferencia}%` : ""}) — ${clienteNombre}${cuentaNombre ? ` → ${cuentaNombre}` : ""}`, metodo_pago: "Transferencia", monto: trForVenta, referencia_id: venta.id, referencia_tipo: "venta", ...(cuentaNombre ? { cuenta_bancaria: cuentaNombre } : {}) });
                        }
                      } else if (result.metodo === "Transferencia") {
                        // paid = pre-surcharge + surcharge already; don't add trSurcharge again
                        await supabase.from("caja_movimientos").insert({ fecha: hoy, hora, tipo: "ingreso", descripcion: `Cobro entrega #${venta.numero} (Transferencia${result.surcharge > 0 ? ` +${porcentajeTransferencia}%` : ""}) — ${clienteNombre}${cuentaNombre ? ` → ${cuentaNombre}` : ""}`, metodo_pago: "Transferencia", monto: paid, referencia_id: venta.id, referencia_tipo: "venta", ...(cuentaNombre ? { cuenta_bancaria: cuentaNombre } : {}) });
                      } else if (result.metodo === "Cuenta Corriente") {
                        // CC does NOT go to caja — it's handled below in the CC section (cuenta_corriente)
                      } else {
                        await supabase.from("caja_movimientos").insert({ fecha: hoy, hora, tipo: "ingreso", descripcion: `Cobro entrega #${venta.numero} (${result.metodo}) — ${clienteNombre}`, metodo_pago: result.metodo, monto: paid, referencia_id: venta.id, referencia_tipo: "venta" });
                      }
                      // Update venta
                      const ventaUpd: Record<string, any> = { forma_pago: result.metodo, monto_pagado: (pagadoPorVenta[venta.id] || 0) + paid };
                      if (cuentaNombre) ventaUpd.cuenta_transferencia_alias = cuentaNombre;
                      // Only update total on FIRST cobro — adjusts for payment method change
                      // (e.g., checkout had transfer surcharge but paying cash now).
                      // On subsequent cobros, total must NOT change (it would corrupt the order total).
                      if ((pagadoPorVenta[venta.id] || 0) === 0) {
                        ventaUpd.total = result.monto + (result.surcharge || 0);
                      }
                      await supabase.from("ventas").update(ventaUpd).eq("id", venta.id);
                    }

                    // CC portion (Mixto remainder or full CC) — atomic saldo
                    // Combined with cobro saldo in a SINGLE RPC call to prevent race conditions.
                    const ccAmount = result.metodo === "Cuenta Corriente" ? preDebeGrupo : result.cuentaCorriente;
                    const saldoAllocTotalForRPC = result.cobrarSaldo ? result.saldoAllocations.reduce((s, a) => s + a.aplicar, 0) : 0;
                    const netSaldoChange = ccAmount - saldoAllocTotalForRPC; // +CC -cobro in one shot
                    if ((ccAmount > 0 || saldoAllocTotalForRPC > 0) && payVenta.cliente_id) {
                      // Single atomic saldo update: +CC -cobroSaldo
                      const { data: newSaldoCC } = await supabase.rpc("atomic_update_client_saldo", { p_client_id: payVenta.cliente_id, p_change: netSaldoChange });
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

                    // FIFO saldo allocation (pay old debts) — atomic saldo + caja + per-venta CC entries
                    if (result.cobrarSaldo && result.saldoAllocations.length > 0) {
                      for (const alloc of result.saldoAllocations) {
                        if (alloc.aplicar <= 0) continue;
                        const { data: old } = await supabase.from("ventas").select("monto_pagado").eq("id", alloc.venta_id).single();
                        await supabase.from("ventas").update({ monto_pagado: ((old as any)?.monto_pagado || 0) + alloc.aplicar }).eq("id", alloc.venta_id);
                      }
                      const totalAllocated = result.saldoAllocations.reduce((s, a) => s + a.aplicar, 0);
                      if (totalAllocated > 0 && payVenta.cliente_id) {
                        // Register in caja — the collector received this money
                        await supabase.from("caja_movimientos").insert({
                          fecha: hoy, hora, tipo: "ingreso",
                          descripcion: `Cobro saldo adeudado — ${clienteNombre} (${result.saldoAllocations.filter(a => a.aplicar > 0).map(a => `#${a.numero}`).join(", ")})`,
                          metodo_pago: result.metodo === "Mixto" ? "Efectivo" : result.metodo,
                          monto: totalAllocated,
                          referencia_id: payVenta.id,
                          referencia_tipo: "cobro_saldo",
                        });

                        // Saldo already updated in the combined RPC above (+CC -cobro)
                        // Read current saldo for CC entry snapshots
                        const { data: saldoNow } = await supabase.from("clientes").select("saldo").eq("id", payVenta.cliente_id).single();
                        const saldoAfter2 = Math.max(0, saldoNow?.saldo ?? 0);
                        // Create per-venta CC haber entries (so each venta shows the cobro)
                        let runningSaldo2 = saldoAfter2 + totalAllocated; // reconstruct pre-update
                        for (const alloc of result.saldoAllocations) {
                          if (alloc.aplicar <= 0) continue;
                          runningSaldo2 -= alloc.aplicar;
                          await supabase.from("cuenta_corriente").insert({
                            cliente_id: payVenta.cliente_id, fecha: hoy,
                            comprobante: `Cobro saldo #${alloc.numero}`,
                            descripcion: `Cobro deuda anterior — ${result.metodo}`,
                            debe: 0, haber: alloc.aplicar, saldo: Math.max(0, runningSaldo2),
                            forma_pago: result.metodo, venta_id: alloc.venta_id,
                          });
                        }
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

      {/* Notify clients dialog */}
      <Dialog open={showNotifDialog} onOpenChange={setShowNotifDialog}>
        <DialogContent className="max-w-sm max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-primary" />
              Notificar clientes
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-1">
            <p className="text-sm text-muted-foreground">
              Se enviará la notificación <strong>&quot;Tu pedido está en camino&quot;</strong> a los siguientes clientes:
            </p>
            <div className="border rounded-lg divide-y max-h-52 overflow-y-auto">
              {(() => {
                const seen = new Set<string>();
                const uniqueClientes: ClienteInfo[] = [];
                for (const v of filteredVentas) {
                  if (v.clientes && v.cliente_id && !seen.has(v.cliente_id)) {
                    seen.add(v.cliente_id);
                    uniqueClientes.push(v.clientes);
                  }
                }
                return uniqueClientes.map((c) => (
                  <div key={c.id} className="px-3 py-2 text-sm flex items-center justify-between">
                    <span className="font-medium">{c.nombre}</span>
                    {c.telefono && <span className="text-xs text-gray-400">{c.telefono}</span>}
                  </div>
                ));
              })()}
            </div>
            {(() => {
              const count = new Set(filteredVentas.map((v) => v.cliente_id).filter(Boolean)).size;
              return <p className="text-xs text-gray-400">{count} cliente{count !== 1 ? "s" : ""} serán notificados</p>;
            })()}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setShowNotifDialog(false)}>Cancelar</Button>
              <Button size="sm" onClick={() => { setShowNotifDialog(false); enviarNotificacionesRuta(); }} disabled={notifSending}>
                {notifSending ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Enviando...</> : <><Bell className="w-4 h-4 mr-1.5" /> Enviar notificaciones</>}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Share route dialog */}
      <Dialog open={showShareDialog} onOpenChange={setShowShareDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Share2 className="w-5 h-5" />
              Compartir con el repartidor
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            {/* Permisos */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-wide">Permisos del repartidor</Label>
              <div className="grid grid-cols-1 gap-1.5">
                {([
                  { value: "solo_ver", label: "Solo ver", desc: "Ve las entregas pero no puede hacer nada" },
                  { value: "confirmar", label: "Confirmar entregas", desc: "Puede marcar entregas como completadas" },
                  { value: "confirmar_cobrar", label: "Confirmar y cobrar", desc: "Puede confirmar entregas y registrar pagos" },
                ] as const).map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setModoLink(opt.value)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg border-2 transition-all ${
                      modoLink === opt.value ? "border-primary bg-primary/5" : "border-muted hover:border-primary/30"
                    }`}
                  >
                    <span className={`text-sm font-medium ${modoLink === opt.value ? "text-primary" : "text-foreground"}`}>{opt.label}</span>
                    <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Link */}
            {hojaToken && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground uppercase tracking-wide">Link para el repartidor</Label>
                <div className="flex items-center gap-2">
                  <Input readOnly value={`${window.location.origin}/ruta/${hojaToken}`} className="text-xs font-mono bg-muted/50" />
                  <Button variant="outline" size="icon" className="shrink-0" onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/ruta/${hojaToken}`);
                  }} title="Copiar link">
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* Action buttons */}
            {hojaToken ? (
              <div className="space-y-2">
                <Button
                  className="w-full h-12 text-base bg-green-600 hover:bg-green-700 text-white"
                  onClick={() => {
                    const url = `${window.location.origin}/ruta/${hojaToken}`;
                    window.open(`https://wa.me/?text=${encodeURIComponent(`Hoja de ruta:\n${url}`)}`, "_blank");
                  }}
                >
                  <MessageCircle className="w-5 h-5 mr-2" />
                  Enviar por WhatsApp
                </Button>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => {
                    window.open(`/ruta/${hojaToken}`, "_blank");
                  }}>
                    <ExternalLink className="w-4 h-4 mr-1.5" />
                    Abrir link
                  </Button>
                  <Button variant="outline" className="flex-1" onClick={() => { setShowShareDialog(false); saveAndShareRuta(); }} disabled={savingRuta}>
                    {savingRuta ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1.5" />}
                    Actualizar
                  </Button>
                </div>
              </div>
            ) : (
              <Button className="w-full h-12" onClick={() => { setShowShareDialog(false); saveAndShareRuta(); }} disabled={savingRuta}>
                {savingRuta ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Share2 className="w-4 h-4 mr-2" />}
                Generar link para compartir
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog — notificar al siguiente cliente */}
      {notifSiguienteDialog?.open && (() => {
        const nombre = notifSiguienteDialog.clienteNombre;
        const primerNombre = nombre.trim().split(" ")[0];
        const tieneApp = !!notifSiguienteDialog.clienteAuthId;
        const { titulo, mensaje } = buildNotifMensaje({
          tipo: "envio",
          primerNombre,
          formaPago: notifSiguienteDialog.formaPago,
          montoPendiente: notifSiguienteDialog.montoPendiente,
          montoEfectivo: notifSiguienteDialog.montoEfectivo,
        });

        return (
          <Dialog
            open={notifSiguienteDialog.open}
            onOpenChange={(o) => { if (!o) setNotifSiguienteDialog(null); }}
          >
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Bell className="w-5 h-5 text-primary" />
                  Avisar al siguiente cliente?
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {/* Info del siguiente cliente */}
                <div className="bg-muted/50 rounded-xl p-4 space-y-1">
                  <p className="text-sm font-semibold text-foreground">{nombre}</p>
                  <p className="text-xs text-muted-foreground">
                    Pedido #{notifSiguienteDialog.numeroPedido}
                  </p>
                </div>

                {tieneApp ? (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      Se le enviara esta notificacion:
                    </p>
                    <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 space-y-1">
                      <p className="text-sm font-semibold text-blue-900">{titulo}</p>
                      <p className="text-xs text-blue-700">{mensaje}</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-xl p-3">
                    <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700">
                      Este cliente no tiene la app instalada o no activo las
                      notificaciones. No se puede enviar push.
                    </p>
                  </div>
                )}

                <div className="flex gap-2 pt-1">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setNotifSiguienteDialog(null)}
                    disabled={notifSiguienteLoading}
                  >
                    Omitir
                  </Button>
                  {tieneApp && (
                    <Button
                      className="flex-1"
                      onClick={enviarNotifSiguiente}
                      disabled={notifSiguienteLoading}
                    >
                      {notifSiguienteLoading
                        ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Enviando...</>
                        : <><Bell className="w-4 h-4 mr-1.5" />Notificar</>
                      }
                    </Button>
                  )}
                </div>
              </div>
            </DialogContent>
          </Dialog>
        );
      })()}
    </div>
  );
}
