"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { formatCurrency } from "@/lib/formatters";
import { showAdminToast } from "@/components/admin-toast";
import {
  Plus, Link2, Copy, Check, ChevronDown, ChevronUp,
  Loader2, AlertCircle, CheckCircle2, MapPin,
  Truck, RefreshCw, Calendar, DollarSign, CheckCircle,
  Eye, Banknote, Landmark, FileText
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// ─── Types ───
interface VentaRow {
  id: string;
  numero: string;
  tipo_comprobante: string;
  total: number;
  forma_pago: string;
  monto_pagado: number;
  fecha: string;
  cliente_id: string | null;
  metodo_entrega?: string | null;
  estado?: string;
  observacion?: string | null;
  origen?: string | null;
  clientes: { nombre: string; domicilio: string | null; localidad: string | null; telefono: string | null; saldo: number; } | null;
}

interface HojaRuta {
  id: string;
  fecha: string;
  nombre: string;
  estado: string;
  modo_link: string;
  token_fijo: string | null;
  token_temp: string | null;
  token_temp_expira: string | null;
  created_at: string;
}

interface HojaItem {
  id: string;
  orden: number;
  completado: boolean;
  venta_id: string;
  ventas: VentaRow;
}

interface CuentaBancaria { id: string; nombre: string; alias: string; }

// ─── Main Component ───
export default function HojaRutaPage() {
  // ─── Tabs ───
  const [tab, setTab] = useState<"hojas" | "pendientes" | "historial">("hojas");

  // ─── Hojas de ruta ───
  const [hojas, setHojas] = useState<HojaRuta[]>([]);
  const [hojaItems, setHojaItems] = useState<Record<string, HojaItem[]>>({});
  const [loadingHojas, setLoadingHojas] = useState(true);
  const [expandedHoja, setExpandedHoja] = useState<string | null>(null);

  // ─── Crear hoja ───
  const [showCrear, setShowCrear] = useState(false);
  const [ventasPendientes, setVentasPendientes] = useState<VentaRow[]>([]);
  const [selectedVentaIds, setSelectedVentaIds] = useState<Set<string>>(new Set());
  const [nombreHoja, setNombreHoja] = useState("");
  const [ordenCreacion, setOrdenCreacion] = useState<string[]>([]);
  const [creando, setCreando] = useState(false);

  // ─── Link generation ───
  const [linkDialog, setLinkDialog] = useState<{ open: boolean; hojaId: string; nombre: string } | null>(null);
  const [modoLink, setModoLink] = useState<"solo_ver" | "confirmar" | "confirmar_cobrar">("confirmar_cobrar");
  const [tipoLink, setTipoLink] = useState<"fijo" | "temporal">("temporal");
  const [expiraHoras, setExpiraHoras] = useState("24");
  const [generandoLink, setGenerandoLink] = useState(false);
  const [linkGenerado, setLinkGenerado] = useState("");
  const [copiado, setCopiado] = useState(false);

  // ─── Cobro ───
  const [cuentasBancarias, setCuentasBancarias] = useState<CuentaBancaria[]>([]);
  const [recargoTransferencia, setRecargoTransferencia] = useState(0);
  const [pagadoPorVenta, setPagadoPorVenta] = useState<Record<string, number>>({});
  const [paySaving, setPaySaving] = useState(false);

  // ─── Historial tab ───
  const [historialVentas, setHistorialVentas] = useState<VentaRow[]>([]);
  const [historialFechaDesde, setHistorialFechaDesde] = useState(() => new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }));
  const [historialFechaHasta, setHistorialFechaHasta] = useState(() => new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }));
  const [loadingHistorial, setLoadingHistorial] = useState(false);
  const [historialPagos, setHistorialPagos] = useState<Record<string, { monto: number; metodo: string; cuenta_bancaria?: string; fecha_hora?: string }[]>>({});
  const [historialSearch, setHistorialSearch] = useState("");
  const [historialFilterEntrega, setHistorialFilterEntrega] = useState<"todos" | "envio" | "retiro">("todos");
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [detailPagos, setDetailPagos] = useState<{ metodo: string; monto: number; cuenta_bancaria?: string | null }[]>([]);
  const [detailVenta, setDetailVenta] = useState<VentaRow | null>(null);

  function argToday() {
    return new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
  }
  function argNow() {
    const ar = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
    return { fecha: ar.toISOString().split("T")[0], hora: ar.toTimeString().slice(0, 5) };
  }

  // ─── Load hojas ───
  const fetchHojas = useCallback(async () => {
    setLoadingHojas(true);
    const { data } = await supabase.from("hoja_ruta").select("*").order("created_at", { ascending: false }).limit(30);
    setHojas(data || []);
    setLoadingHojas(false);
  }, []);

  const fetchHojaItems = useCallback(async (hojaId: string) => {
    const { data } = await supabase
      .from("hoja_ruta_items")
      .select(`id, orden, completado, venta_id, ventas ( id, numero, tipo_comprobante, total, forma_pago, monto_pagado, fecha, cliente_id, metodo_entrega, clientes ( nombre, domicilio, localidad, telefono, saldo ) )`)
      .eq("hoja_ruta_id", hojaId)
      .order("orden");
    if (data) {
      setHojaItems(prev => ({ ...prev, [hojaId]: data as unknown as HojaItem[] }));
      const vids = data.map((i: any) => i.venta_id);
      if (vids.length > 0) {
        const { data: movs } = await supabase.from("caja_movimientos").select("referencia_id, monto").in("referencia_id", vids).eq("referencia_tipo", "venta").eq("tipo", "ingreso");
        const map: Record<string, number> = {};
        for (const m of movs || []) map[m.referencia_id] = (map[m.referencia_id] || 0) + m.monto;
        setPagadoPorVenta(prev => ({ ...prev, ...map }));
      }
    }
  }, []);

  // ─── Load ventas pendientes para crear hoja ───
  const fetchVentasPendientes = useCallback(async () => {
    const { data } = await supabase
      .from("ventas")
      .select("id, numero, tipo_comprobante, total, forma_pago, monto_pagado, fecha, cliente_id, metodo_entrega, clientes ( nombre, domicilio, localidad, telefono, saldo )")
      .eq("entregado", false)
      .in("metodo_entrega", ["envio", "envio_a_domicilio", "envio a domicilio"])
      .not("tipo_comprobante", "ilike", "Nota de Crédito%")
      .neq("estado", "anulada")
      .not("cliente_id", "is", null)
      .order("fecha", { ascending: true });
    setVentasPendientes((data || []) as unknown as VentaRow[]);
  }, []);

  // ─── Load config ───
  const fetchConfig = useCallback(async () => {
    const [{ data: cb }, { data: cfg }] = await Promise.all([
      supabase.from("cuentas_bancarias").select("id, nombre, alias").order("nombre"),
      supabase.from("tienda_config").select("recargo_transferencia").limit(1).single(),
    ]);
    setCuentasBancarias(cb || []);
    setRecargoTransferencia(cfg?.recargo_transferencia ?? 0);
  }, []);

  useEffect(() => { fetchHojas(); fetchConfig(); }, [fetchHojas, fetchConfig]);

  // ─── Crear nueva hoja ───
  const handleCrearHoja = async () => {
    if (selectedVentaIds.size === 0) return;
    setCreando(true);
    const today = argToday();
    const nombre = nombreHoja.trim() || `Ruta del ${new Date(today + "T12:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "long" })}`;
    const { data: nuevaHoja, error } = await supabase.from("hoja_ruta").insert({ fecha: today, nombre, estado: "activa" }).select().single();
    if (error || !nuevaHoja) { showAdminToast("Error al crear hoja", "error"); setCreando(false); return; }

    const ventasOrdenadas = ordenCreacion.filter(id => selectedVentaIds.has(id));
    const items = ventasOrdenadas.map((ventaId, idx) => ({ hoja_ruta_id: nuevaHoja.id, venta_id: ventaId, orden: idx + 1 }));
    await supabase.from("hoja_ruta_items").insert(items);

    showAdminToast(`Hoja "${nombre}" creada`, "success");
    setShowCrear(false);
    setSelectedVentaIds(new Set());
    setNombreHoja("");
    setOrdenCreacion([]);
    await fetchHojas();
    setExpandedHoja(nuevaHoja.id);
    await fetchHojaItems(nuevaHoja.id);
    setCreando(false);
  };

  // ─── Reorder items (persist to DB) ───
  const handleMoveItem = async (hojaId: string, itemId: string, direction: "up" | "down") => {
    const items = [...(hojaItems[hojaId] || [])].sort((a, b) => a.orden - b.orden);
    const idx = items.findIndex(i => i.id === itemId);
    if (direction === "up" && idx === 0) return;
    if (direction === "down" && idx === items.length - 1) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    const newItems = [...items];
    [newItems[idx], newItems[swapIdx]] = [newItems[swapIdx], newItems[idx]];
    await Promise.all(newItems.map((item, i) =>
      supabase.from("hoja_ruta_items").update({ orden: i + 1 }).eq("id", item.id)
    ));
    await fetchHojaItems(hojaId);
  };

  // ─── Generate link ───
  const handleGenerarLink = async () => {
    if (!linkDialog) return;
    setGenerandoLink(true);
    const token = crypto.randomUUID().replace(/-/g, "").slice(0, 24);
    const updates: Record<string, unknown> = { modo_link: modoLink };
    if (tipoLink === "fijo") {
      updates.token_fijo = token;
    } else {
      updates.token_temp = token;
      updates.token_temp_expira = new Date(Date.now() + Number(expiraHoras) * 3600 * 1000).toISOString();
    }
    await supabase.from("hoja_ruta").update(updates).eq("id", linkDialog.hojaId);
    const url = `${window.location.origin}/ruta/${token}`;
    setLinkGenerado(url);
    await fetchHojas();
    setGenerandoLink(false);
  };

  const handleCopyLink = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  // ─── Cobrar desde admin (efectivo rápido) ───
  const handleCobrarAdmin = async (hojaId: string, item: HojaItem, cobro: { metodo: string; efectivo: number; transferencia: number; cc: number; cuentaBancaria: string; }) => {
    setPaySaving(true);
    const { fecha, hora } = argNow();
    const venta = item.ventas;
    const pendiente = Math.max(0, venta.total - (pagadoPorVenta[venta.id] || 0));
    const recargo = cobro.metodo === "Transferencia" ? Math.round(pendiente * recargoTransferencia) / 100 : 0;

    const entries: Record<string, unknown>[] = [];
    if (cobro.metodo === "Mixto") {
      if (cobro.efectivo > 0) entries.push({ fecha, hora, tipo: "ingreso", descripcion: `Cobro entrega #${venta.numero} (Efectivo)`, metodo_pago: "Efectivo", monto: cobro.efectivo, referencia_id: venta.id, referencia_tipo: "venta" });
      if (cobro.transferencia > 0) entries.push({ fecha, hora, tipo: "ingreso", descripcion: `Cobro entrega #${venta.numero} (Transferencia)`, metodo_pago: "Transferencia", monto: cobro.transferencia, referencia_id: venta.id, referencia_tipo: "venta", ...(cobro.cuentaBancaria ? { cuenta_bancaria: cobro.cuentaBancaria } : {}) });
    } else if (cobro.metodo !== "Cuenta Corriente") {
      entries.push({ fecha, hora, tipo: "ingreso", descripcion: `Cobro entrega #${venta.numero}${recargo > 0 ? " (Transf)" : ""}`, metodo_pago: cobro.metodo, monto: pendiente + recargo, referencia_id: venta.id, referencia_tipo: "venta", ...(cobro.cuentaBancaria ? { cuenta_bancaria: cobro.cuentaBancaria } : {}) });
    }
    if (entries.length > 0) await supabase.from("caja_movimientos").insert(entries);

    if (cobro.cc > 0 && venta.cliente_id) {
      const { data: newSaldo } = await supabase.rpc("atomic_update_client_saldo", { p_client_id: venta.cliente_id, p_change: cobro.cc });
      await supabase.from("cuenta_corriente").insert({ cliente_id: venta.cliente_id, fecha, comprobante: `Cobro entrega #${venta.numero}`, descripcion: "Saldo a cuenta corriente", debe: cobro.cc, haber: 0, saldo: newSaldo ?? 0, forma_pago: cobro.metodo, venta_id: venta.id });
    }

    const pagadoAhora = cobro.metodo === "Cuenta Corriente" ? 0 : pendiente;
    await supabase.from("ventas").update({ forma_pago: cobro.metodo, monto_pagado: (pagadoPorVenta[venta.id] || 0) + pagadoAhora, entregado: true, estado: "entregado", ...(cobro.cuentaBancaria ? { cuenta_transferencia_alias: cobro.cuentaBancaria } : {}) }).eq("id", venta.id);
    if (venta.numero) await supabase.from("pedidos_tienda").update({ estado: "entregado" }).eq("numero", venta.numero);
    await supabase.from("hoja_ruta_items").update({ completado: true, completado_at: new Date().toISOString() }).eq("id", item.id);

    showAdminToast(`Cobro registrado — ${venta.clientes?.nombre}`, "success");
    await fetchHojaItems(hojaId);
    setPaySaving(false);
  };

  // ─── Confirmar entrega sin cobro ───
  const handleConfirmarEntrega = async (hojaId: string, item: HojaItem) => {
    await supabase.from("ventas").update({ entregado: true, estado: "entregado" }).eq("id", item.venta_id);
    await supabase.from("hoja_ruta_items").update({ completado: true, completado_at: new Date().toISOString() }).eq("id", item.id);
    if (item.ventas?.numero) await supabase.from("pedidos_tienda").update({ estado: "entregado" }).eq("numero", item.ventas.numero);
    showAdminToast("Entrega confirmada", "success");
    await fetchHojaItems(hojaId);
  };

  // ─── Load historial ───
  const fetchHistorial = useCallback(async () => {
    setLoadingHistorial(true);
    const nextDay = new Date(historialFechaHasta + "T12:00:00");
    nextDay.setDate(nextDay.getDate() + 1);
    const endDate = nextDay.toISOString().split("T")[0];

    const { data } = await supabase
      .from("ventas")
      .select("id, numero, tipo_comprobante, fecha, forma_pago, total, estado, cliente_id, metodo_entrega, clientes ( nombre, domicilio, localidad, telefono, saldo )")
      .eq("entregado", true)
      .gte("fecha", historialFechaDesde)
      .lt("fecha", endDate)
      .neq("estado", "anulada")
      .not("tipo_comprobante", "ilike", "Nota de Crédito%")
      .order("fecha", { ascending: false });

    const rows = (data || []) as unknown as VentaRow[];
    setHistorialVentas(rows);

    if (rows.length > 0) {
      const ventaIds = rows.map(v => v.id);
      const [{ data: movs }, { data: ncDirect }, { data: facturas }] = await Promise.all([
        supabase.from("caja_movimientos").select("referencia_id, monto, metodo_pago, cuenta_bancaria, created_at").eq("tipo", "ingreso").eq("referencia_tipo", "venta").in("referencia_id", ventaIds),
        supabase.from("ventas").select("remito_origen_id, total").in("remito_origen_id", ventaIds).ilike("tipo_comprobante", "Nota de Crédito%").neq("estado", "anulada"),
        supabase.from("ventas").select("id, remito_origen_id").in("remito_origen_id", ventaIds).ilike("tipo_comprobante", "Factura%"),
      ]);

      const facturaToVenta: Record<string, string> = {};
      (facturas || []).forEach((f: any) => { if (f.remito_origen_id) facturaToVenta[f.id] = f.remito_origen_id; });
      const facturaIds = Object.keys(facturaToVenta);
      let ncViaFactura: any[] = [];
      if (facturaIds.length > 0) {
        const { data: ncF } = await supabase.from("ventas").select("remito_origen_id, total").in("remito_origen_id", facturaIds).ilike("tipo_comprobante", "Nota de Crédito%").neq("estado", "anulada");
        ncViaFactura = ncF || [];
      }

      const pagosMap: Record<string, { monto: number; metodo: string; cuenta_bancaria?: string; fecha_hora?: string }[]> = {};
      (movs || []).forEach((m: any) => {
        if (!pagosMap[m.referencia_id]) pagosMap[m.referencia_id] = [];
        pagosMap[m.referencia_id].push({ monto: m.monto, metodo: m.metodo_pago, cuenta_bancaria: m.cuenta_bancaria || undefined, fecha_hora: m.created_at || undefined });
      });
      (ncDirect || []).forEach((nc: any) => {
        if (nc.remito_origen_id && nc.total > 0) {
          if (!pagosMap[nc.remito_origen_id]) pagosMap[nc.remito_origen_id] = [];
          pagosMap[nc.remito_origen_id].push({ monto: nc.total, metodo: "Nota de Crédito" });
        }
      });
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
    setLoadingHistorial(false);
  }, [historialFechaDesde, historialFechaHasta]);

  useEffect(() => { if (tab === "historial") fetchHistorial(); }, [tab, fetchHistorial]);

  // ─── Historial computed values ───
  const filteredHistorial = historialVentas.filter(v => {
    if (historialSearch) {
      const s = historialSearch.toLowerCase();
      if (!v.numero.toLowerCase().includes(s) && !(v.clientes?.nombre || "").toLowerCase().includes(s)) return false;
    }
    if (historialFilterEntrega === "envio" && v.metodo_entrega !== "envio") return false;
    if (historialFilterEntrega === "retiro" && v.metodo_entrega === "envio") return false;
    return true;
  });
  const historialTotalVentas = filteredHistorial.reduce((s, v) => s + v.total, 0);
  const historialTotalCobrado = filteredHistorial.reduce((s, v) => {
    return s + (historialPagos[v.id] || []).filter(p => !p.metodo.includes("Nota de Cr")).reduce((a, p) => a + p.monto, 0);
  }, 0);
  const historialTotalNC = filteredHistorial.reduce((s, v) => {
    return s + (historialPagos[v.id] || []).filter(p => p.metodo.includes("Nota de Cr")).reduce((a, p) => a + p.monto, 0);
  }, 0);
  const historialBreakdown = (() => {
    let efectivo = 0, cuentaCorriente = 0;
    const transferencias: Record<string, number> = {};
    const deudores: { nombre: string; monto: number }[] = [];
    for (const v of filteredHistorial) {
      const pagos = historialPagos[v.id] || [];
      const cobradoSinNC = pagos.filter(p => !p.metodo.includes("Nota de Cr")).reduce((a, p) => a + p.monto, 0);
      const ncMonto = pagos.filter(p => p.metodo.includes("Nota de Cr")).reduce((a, p) => a + p.monto, 0);
      const debe = (v.total - ncMonto) - cobradoSinNC;
      if (debe > 0) deudores.push({ nombre: v.clientes?.nombre || "Sin cliente", monto: debe });
      for (const p of pagos) {
        if (p.metodo.includes("Nota de Cr")) continue;
        if (p.metodo === "Efectivo") efectivo += p.monto;
        else if (p.metodo === "Cuenta Corriente") cuentaCorriente += p.monto;
        else if (p.metodo === "Transferencia") {
          const key = p.cuenta_bancaria || "Sin cuenta";
          transferencias[key] = (transferencias[key] || 0) + p.monto;
        } else { efectivo += p.monto; }
      }
    }
    return { efectivo, totalTransferencias: Object.values(transferencias).reduce((s, v) => s + v, 0), transferencias, cuentaCorriente, deudores };
  })();
  const historialByDay = (() => {
    const map: Record<string, VentaRow[]> = {};
    for (const v of filteredHistorial) {
      if (!map[v.fecha]) map[v.fecha] = [];
      map[v.fecha].push(v);
    }
    return Object.entries(map).sort(([a], [b]) => b.localeCompare(a));
  })();

  const handleViewDetail = async (venta: VentaRow) => {
    setDetailVenta(venta);
    setDetailPagos([]);
    setDetailDialogOpen(true);
    const { data: movs } = await supabase.from("caja_movimientos").select("metodo_pago, monto, cuenta_bancaria").eq("referencia_id", venta.id).eq("referencia_tipo", "venta").eq("tipo", "ingreso");
    if (movs && movs.length > 0) {
      setDetailPagos(movs.map((m: any) => ({ metodo: m.metodo_pago, monto: m.monto, cuenta_bancaria: m.cuenta_bancaria })));
    } else if (venta.forma_pago) {
      setDetailPagos([{ metodo: venta.forma_pago, monto: venta.total }]);
    }
  };

  // ─── Render ───
  return (
    <div className="p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Hoja de Ruta</h1>
        {tab === "hojas" && (
          <Button onClick={() => { setShowCrear(true); fetchVentasPendientes(); }} className="gap-2">
            <Plus className="w-4 h-4" /> Nueva hoja
          </Button>
        )}
        {tab === "pendientes" && (
          <Button variant="outline" size="sm" onClick={fetchVentasPendientes} className="gap-2">
            Actualizar
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6">
        {([["hojas", "Hojas activas"], ["pendientes", "Sin asignar"], ["historial", "Historial"]] as const).map(([key, label]) => (
          <button key={key} onClick={() => { setTab(key); if (key === "pendientes") fetchVentasPendientes(); }}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${tab === key ? "bg-white shadow text-gray-900" : "text-gray-500 hover:text-gray-700"}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ─── TAB: Hojas activas ─── */}
      {tab === "hojas" && (
        <div className="space-y-4">
          {loadingHojas ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
          ) : hojas.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Truck className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p>No hay hojas de ruta. Creá una nueva.</p>
            </div>
          ) : hojas.map(hoja => {
            const items = hojaItems[hoja.id] || [];
            const entregadas = items.filter(i => i.completado).length;
            const pct = items.length > 0 ? Math.round((entregadas / items.length) * 100) : 0;
            const isExpanded = expandedHoja === hoja.id;
            const existingLink = hoja.token_fijo
              ? `${typeof window !== "undefined" ? window.location.origin : ""}/ruta/${hoja.token_fijo}`
              : hoja.token_temp && hoja.token_temp_expira && new Date(hoja.token_temp_expira) > new Date()
              ? `${typeof window !== "undefined" ? window.location.origin : ""}/ruta/${hoja.token_temp}`
              : null;

            return (
              <div key={hoja.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm">
                {/* Hoja header */}
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 truncate">{hoja.nombre}</h3>
                      <p className="text-xs text-gray-500 mt-0.5">{new Date(hoja.fecha + "T12:00:00").toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => { setLinkDialog({ open: true, hojaId: hoja.id, nombre: hoja.nombre }); setLinkGenerado(existingLink || ""); setModoLink(hoja.modo_link as "solo_ver" | "confirmar" | "confirmar_cobrar"); }}
                        className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200">
                        <Link2 className="w-3.5 h-3.5" /> Link
                      </button>
                      <button onClick={() => {
                        const newExpanded = isExpanded ? null : hoja.id;
                        setExpandedHoja(newExpanded);
                        if (newExpanded) fetchHojaItems(hoja.id);
                      }} className="p-1.5 rounded-lg hover:bg-gray-100">
                        {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                      </button>
                    </div>
                  </div>

                  {/* Progress */}
                  {isExpanded && items.length > 0 && (
                    <div className="mt-3 flex items-center gap-3">
                      <div className="flex-1 bg-gray-100 rounded-full h-2">
                        <div className="bg-emerald-500 h-2 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-gray-500 shrink-0">{entregadas}/{items.length} entregadas</span>
                    </div>
                  )}
                </div>

                {/* Items expanded */}
                {isExpanded && (
                  <div className="border-t">
                    {items.length === 0 ? (
                      <p className="text-center text-gray-400 text-sm py-6">Cargando...</p>
                    ) : items.map((item, idx) => {
                      const venta = item.ventas;
                      const cliente = venta?.clientes;
                      const pendiente = Math.max(0, (venta?.total || 0) - (pagadoPorVenta[venta?.id] || 0));
                      const saldoAnterior = Math.max(0, (cliente?.saldo || 0) - (item.completado ? 0 : pendiente));

                      return (
                        <div key={item.id} className={`flex items-start gap-3 px-4 py-3 border-b last:border-b-0 ${item.completado ? "bg-emerald-50/30" : ""}`}>
                          {/* Reorder buttons */}
                          <div className="flex flex-col gap-0.5 shrink-0 mt-1">
                            <button onClick={() => handleMoveItem(hoja.id, item.id, "up")} disabled={idx === 0}
                              className="text-gray-300 hover:text-gray-600 disabled:opacity-20 p-0.5 text-xs">▲</button>
                            <button onClick={() => handleMoveItem(hoja.id, item.id, "down")} disabled={idx === items.length - 1}
                              className="text-gray-300 hover:text-gray-600 disabled:opacity-20 p-0.5 text-xs">▼</button>
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-gray-400 w-5">{item.orden}</span>
                                {item.completado && <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />}
                                <span className="font-medium text-sm text-gray-900 truncate">{cliente?.nombre || "Sin cliente"}</span>
                              </div>
                              <span className="text-sm font-bold text-gray-800 shrink-0">
                                {item.completado ? <span className="text-emerald-600 text-xs">Entregado</span> : formatCurrency(pendiente)}
                              </span>
                            </div>
                            {cliente?.domicilio && (
                              <p className="text-xs text-gray-400 mt-0.5 ml-7 truncate">
                                <MapPin className="w-3 h-3 inline mr-1" />{cliente.domicilio}
                              </p>
                            )}
                            {/* Saldo anterior badge */}
                            {!item.completado && saldoAnterior > 0 && (
                              <div className="ml-7 mt-1 inline-flex items-center gap-1 bg-orange-50 border border-orange-200 rounded-md px-2 py-0.5">
                                <AlertCircle className="w-3 h-3 text-orange-500" />
                                <span className="text-xs text-orange-700">Saldo anterior: {formatCurrency(saldoAnterior)}</span>
                              </div>
                            )}
                            {/* Action buttons */}
                            {!item.completado && pendiente > 0 && (
                              <div className="ml-7 mt-2 flex gap-2">
                                <button
                                  onClick={() => handleCobrarAdmin(hoja.id, item, { metodo: "Efectivo", efectivo: pendiente, transferencia: 0, cc: 0, cuentaBancaria: "" })}
                                  disabled={paySaving}
                                  className="text-xs px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                                >
                                  Cobrar efectivo
                                </button>
                                <button
                                  onClick={() => handleConfirmarEntrega(hoja.id, item)}
                                  disabled={paySaving}
                                  className="text-xs px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50"
                                >
                                  Sin cobro
                                </button>
                              </div>
                            )}
                            {!item.completado && pendiente <= 0 && (
                              <div className="ml-7 mt-2">
                                <button
                                  onClick={() => handleConfirmarEntrega(hoja.id, item)}
                                  disabled={paySaving}
                                  className="text-xs px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                                >
                                  Confirmar entrega
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ─── TAB: Sin asignar ─── */}
      {tab === "pendientes" && (
        <div className="space-y-3">
          {ventasPendientes.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <CheckCircle2 className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p>No hay entregas pendientes sin asignar</p>
            </div>
          ) : ventasPendientes.map(v => (
            <div key={v.id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-sm text-gray-900">{v.clientes?.nombre}</p>
                  <p className="text-xs text-gray-400">{v.tipo_comprobante} #{v.numero} — {new Date(v.fecha + "T12:00:00").toLocaleDateString("es-AR")}</p>
                </div>
                <span className="font-bold text-gray-800">{formatCurrency(v.total)}</span>
              </div>
              {v.clientes?.domicilio && <p className="text-xs text-gray-400 mt-1"><MapPin className="w-3 h-3 inline mr-1" />{v.clientes.domicilio}</p>}
              {(v.clientes?.saldo || 0) > 0 && (
                <div className="mt-1 inline-flex items-center gap-1 bg-orange-50 border border-orange-200 rounded-md px-2 py-0.5">
                  <AlertCircle className="w-3 h-3 text-orange-500" />
                  <span className="text-xs text-orange-700">Saldo pendiente: {formatCurrency(v.clientes!.saldo)}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ─── TAB: Historial ─── */}
      {tab === "historial" && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-500">Desde</span>
              <Input type="date" value={historialFechaDesde} onChange={e => setHistorialFechaDesde(e.target.value)} className="w-40 h-9" />
              <span className="text-sm text-gray-500">Hasta</span>
              <Input type="date" value={historialFechaHasta} onChange={e => setHistorialFechaHasta(e.target.value)} className="w-40 h-9" />
            </div>
            <input type="text" placeholder="Buscar por N° o cliente..." value={historialSearch} onChange={e => setHistorialSearch(e.target.value)}
              className="flex-1 max-w-xs h-9 px-3 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring" />
            <div className="flex items-center rounded-lg border overflow-hidden">
              {([["todos", "Todos"], ["envio", "Envío"], ["retiro", "Retiro"]] as const).map(([val, label]) => (
                <button key={val} onClick={() => setHistorialFilterEntrega(val)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${historialFilterEntrega === val ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Stats cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <Card className={`cursor-pointer transition-all hover:ring-2 hover:ring-primary/20 ${expandedCard === "entregas" ? "ring-2 ring-primary/40" : ""}`} onClick={() => setExpandedCard(expandedCard === "entregas" ? null : "entregas")}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><CheckCircle className="w-4 h-4" />Entregas</div>
                <div className="text-2xl font-bold">{filteredHistorial.length}</div>
              </CardContent>
            </Card>
            <Card className={`cursor-pointer transition-all hover:ring-2 hover:ring-primary/20 ${expandedCard === "total" ? "ring-2 ring-primary/40" : ""}`} onClick={() => setExpandedCard(expandedCard === "total" ? null : "total")}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><DollarSign className="w-4 h-4" />Total</div>
                <div className="text-2xl font-bold">{formatCurrency(historialTotalVentas - historialTotalNC)}</div>
                {historialTotalNC > 0 && <p className="text-xs text-amber-600 mt-1">NC: -{formatCurrency(historialTotalNC)}</p>}
              </CardContent>
            </Card>
            <Card className={`cursor-pointer transition-all hover:ring-2 hover:ring-green-200 ${expandedCard === "efectivo" ? "ring-2 ring-green-400" : ""}`} onClick={() => setExpandedCard(expandedCard === "efectivo" ? null : "efectivo")}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-green-600 text-xs mb-1"><Banknote className="w-4 h-4" />Efectivo</div>
                <div className="text-2xl font-bold text-green-600">{formatCurrency(historialBreakdown.efectivo)}</div>
              </CardContent>
            </Card>
            <Card className={`cursor-pointer transition-all hover:ring-2 hover:ring-blue-200 ${expandedCard === "transferencias" ? "ring-2 ring-blue-400" : ""}`} onClick={() => setExpandedCard(expandedCard === "transferencias" ? null : "transferencias")}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-blue-600 text-xs mb-1"><Landmark className="w-4 h-4" />Transferencias</div>
                <div className="text-2xl font-bold text-blue-600">{formatCurrency(historialBreakdown.totalTransferencias)}</div>
              </CardContent>
            </Card>
            {historialBreakdown.cuentaCorriente > 0 && (
              <Card className={`cursor-pointer transition-all hover:ring-2 hover:ring-orange-200 ${expandedCard === "cc" ? "ring-2 ring-orange-400" : ""}`} onClick={() => setExpandedCard(expandedCard === "cc" ? null : "cc")}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-orange-600 text-xs mb-1"><FileText className="w-4 h-4" />Cta. Cte.</div>
                  <div className="text-2xl font-bold text-orange-600">{formatCurrency(historialBreakdown.cuentaCorriente)}</div>
                </CardContent>
              </Card>
            )}
            {historialBreakdown.deudores.length > 0 && (
              <Card className={`cursor-pointer transition-all border-orange-200 bg-orange-50/50 hover:ring-2 hover:ring-orange-300 ${expandedCard === "deudores" ? "ring-2 ring-orange-400" : ""}`} onClick={() => setExpandedCard(expandedCard === "deudores" ? null : "deudores")}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-orange-700 text-xs mb-1"><AlertCircle className="w-4 h-4" />Deudores</div>
                  <div className="text-2xl font-bold text-orange-700">{historialBreakdown.deudores.length}</div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Expanded card detail */}
          {expandedCard && (
            <Card className="border-primary/20 bg-muted/30">
              <CardContent className="p-4 text-sm">
                {expandedCard === "total" && (
                  <div className="space-y-1">
                    <p className="font-semibold mb-2">Desglose del total</p>
                    <p>Ventas brutas: <span className="font-bold">{formatCurrency(historialTotalVentas)}</span></p>
                    {historialTotalNC > 0 && <p className="text-amber-600">Notas de crédito: <span className="font-bold">-{formatCurrency(historialTotalNC)}</span></p>}
                    <p className="border-t pt-1 mt-1">Neto: <span className="font-bold">{formatCurrency(historialTotalVentas - historialTotalNC)}</span></p>
                    <p className="text-green-600">Cobrado: <span className="font-bold">{formatCurrency(historialTotalCobrado)}</span></p>
                    {historialTotalVentas - historialTotalNC - historialTotalCobrado > 0 && <p className="text-orange-600">Pendiente: <span className="font-bold">{formatCurrency(historialTotalVentas - historialTotalNC - historialTotalCobrado)}</span></p>}
                  </div>
                )}
                {expandedCard === "transferencias" && (
                  <div className="space-y-1">
                    <p className="font-semibold mb-2">Transferencias por cuenta</p>
                    {Object.entries(historialBreakdown.transferencias).length > 0 ? Object.entries(historialBreakdown.transferencias).map(([cuenta, monto]) => (
                      <div key={cuenta} className="flex justify-between py-1 border-b last:border-0">
                        <span className="text-blue-700">{cuenta}</span>
                        <span className="font-bold text-blue-700">{formatCurrency(monto)}</span>
                      </div>
                    )) : <p className="text-muted-foreground">Sin transferencias</p>}
                    <div className="flex justify-between pt-2 border-t mt-2">
                      <span className="font-semibold">Total</span>
                      <span className="font-bold text-blue-700">{formatCurrency(historialBreakdown.totalTransferencias)}</span>
                    </div>
                  </div>
                )}
                {expandedCard === "cc" && (
                  <div className="space-y-1">
                    <p className="font-semibold mb-2">Cargado a cuenta corriente</p>
                    {filteredHistorial.filter(v => (historialPagos[v.id] || []).some(p => p.metodo === "Cuenta Corriente")).map(v => {
                      const ccMonto = (historialPagos[v.id] || []).filter(p => p.metodo === "Cuenta Corriente").reduce((s, p) => s + p.monto, 0);
                      return (
                        <div key={v.id} className="flex justify-between py-1 border-b last:border-0">
                          <span>{v.clientes?.nombre} <span className="text-muted-foreground text-xs">#{v.numero}</span></span>
                          <span className="font-bold text-orange-600">{formatCurrency(ccMonto)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
                {expandedCard === "deudores" && (
                  <div className="space-y-1">
                    <p className="font-semibold mb-2">Clientes con saldo pendiente</p>
                    {historialBreakdown.deudores.map((d, i) => (
                      <div key={i} className="flex justify-between py-1 border-b last:border-0">
                        <span className="text-orange-700">{d.nombre}</span>
                        <span className="font-bold text-orange-700">{formatCurrency(d.monto)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between pt-2 border-t mt-2 font-semibold">
                      <span>Total deuda</span>
                      <span className="text-orange-700">{formatCurrency(historialBreakdown.deudores.reduce((s, d) => s + d.monto, 0))}</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Historial list */}
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Historial de Entregas</h2>
            <Button variant="outline" size="sm" onClick={fetchHistorial} disabled={loadingHistorial}>
              <RefreshCw className={`w-4 h-4 mr-2 ${loadingHistorial ? "animate-spin" : ""}`} />
              Actualizar
            </Button>
          </div>

          {loadingHistorial ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
          ) : filteredHistorial.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <CheckCircle2 className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p>No hay entregas en este período</p>
            </div>
          ) : (
            <div className="space-y-4">
              {historialByDay.map(([day, dayVentas]) => {
                const dayTotal = dayVentas.reduce((s, v) => {
                  const ncMonto = (historialPagos[v.id] || []).filter(p => p.metodo.includes("Nota de Cr")).reduce((a, p) => a + p.monto, 0);
                  return s + v.total - ncMonto;
                }, 0);
                const dayCobrado = dayVentas.reduce((s, v) => s + (historialPagos[v.id] || []).filter(p => !p.metodo.includes("Nota de Cr")).reduce((a, p) => a + p.monto, 0), 0);
                const dayPendiente = dayTotal - dayCobrado;
                const dayLabel = new Date(day + "T12:00:00").toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
                const clientesDeudores = dayVentas.filter(v => {
                  const pagos = historialPagos[v.id] || [];
                  const cobrado = pagos.filter(p => !p.metodo.includes("Nota de Cr")).reduce((a, p) => a + p.monto, 0);
                  const nc = pagos.filter(p => p.metodo.includes("Nota de Cr")).reduce((a, p) => a + p.monto, 0);
                  return (v.total - nc) - cobrado > 0;
                });

                return (
                  <Card key={day}>
                    <CardContent className="p-4">
                      {/* Day header */}
                      <div className="flex items-center justify-between mb-3 pb-3 border-b">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
                            <Calendar className="w-4 h-4 text-muted-foreground" />
                          </div>
                          <div>
                            <p className="font-semibold capitalize">{dayLabel}</p>
                            <p className="text-xs text-muted-foreground">{dayVentas.length} entrega{dayVentas.length !== 1 ? "s" : ""}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-6 text-sm">
                          <div className="text-right"><p className="text-xs text-muted-foreground">Total</p><p className="font-bold">{formatCurrency(dayTotal)}</p></div>
                          <div className="text-right"><p className="text-xs text-muted-foreground">Cobrado</p><p className="font-bold text-green-600">{formatCurrency(dayCobrado)}</p></div>
                          {dayPendiente > 0 && <div className="text-right"><p className="text-xs text-muted-foreground">Pendiente</p><p className="font-bold text-orange-600">{formatCurrency(dayPendiente)}</p></div>}
                        </div>
                      </div>

                      {clientesDeudores.length > 0 && (
                        <div className="mb-3 px-3 py-2 bg-orange-50 border border-orange-200 rounded-lg text-xs text-orange-700">
                          <span className="font-semibold">Saldo pendiente: </span>
                          {clientesDeudores.map(v => {
                            const pagos = historialPagos[v.id] || [];
                            const cobrado = pagos.filter(p => !p.metodo.includes("Nota de Cr")).reduce((a, p) => a + p.monto, 0);
                            const nc = pagos.filter(p => p.metodo.includes("Nota de Cr")).reduce((a, p) => a + p.monto, 0);
                            return `${v.clientes?.nombre || "Sin cliente"} (${formatCurrency((v.total - nc) - cobrado)})`;
                          }).join(", ")}
                        </div>
                      )}

                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b text-left text-muted-foreground text-xs">
                              <th className="pb-2 px-2">Nro.</th>
                              <th className="pb-2 px-2">Cliente</th>
                              <th className="pb-2 px-2">Entrega</th>
                              <th className="pb-2 px-2 text-right">Total</th>
                              <th className="pb-2 px-2 text-right">Cobrado</th>
                              <th className="pb-2 px-2">Pago</th>
                              <th className="pb-2 px-2 text-right"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {dayVentas.map(venta => {
                              const pagos = historialPagos[venta.id] || [];
                              const cobradoReal = pagos.filter(p => !p.metodo.includes("Nota de Cr")).reduce((a, p) => a + p.monto, 0);
                              const ncMonto = pagos.filter(p => p.metodo.includes("Nota de Cr")).reduce((a, p) => a + p.monto, 0);
                              const totalNeto = venta.total - ncMonto;
                              const debe = totalNeto - cobradoReal;
                              const metodos = [...new Set(pagos.filter(p => !p.metodo.includes("Nota de Cr")).map(p => p.metodo))].join(", ") || venta.forma_pago;

                              return (
                                <tr key={venta.id} className="border-b last:border-b-0 hover:bg-muted/50 transition-colors">
                                  <td className="py-2 px-2">
                                    <p className="font-mono text-xs font-semibold">{venta.numero}</p>
                                    <p className="text-xs text-muted-foreground">{venta.tipo_comprobante}</p>
                                  </td>
                                  <td className="py-2 px-2 font-medium">{venta.clientes?.nombre || "Sin cliente"}</td>
                                  <td className="py-2 px-2">
                                    <Badge variant={venta.metodo_entrega === "envio" ? "default" : "secondary"} className={`text-xs ${venta.metodo_entrega === "envio" ? "bg-blue-100 text-blue-700" : "bg-muted text-muted-foreground"}`}>
                                      {venta.metodo_entrega === "envio" ? "Envío" : "Retiro"}
                                    </Badge>
                                  </td>
                                  <td className="py-2 px-2 text-right font-semibold">{formatCurrency(ncMonto > 0 ? totalNeto : venta.total)}</td>
                                  <td className={`py-2 px-2 text-right font-medium ${debe > 0 ? "text-orange-600" : "text-green-600"}`}>
                                    {cobradoReal > 0 ? formatCurrency(cobradoReal) : "$0"}
                                    {ncMonto > 0 && <span className="block text-xs text-amber-600">NC -{formatCurrency(ncMonto)}</span>}
                                    {debe > 0 && <span className="block text-xs text-orange-500">Debe {formatCurrency(debe)}</span>}
                                  </td>
                                  <td className="py-2 px-2">
                                    {pagos.filter(p => !p.metodo.includes("Nota de Cr")).map((p, pi) => (
                                      <div key={pi} className="text-xs">
                                        <span className="font-medium">{p.metodo}</span>{" "}
                                        <span className="text-muted-foreground">{formatCurrency(p.monto)}</span>
                                        {p.cuenta_bancaria && <span className="text-blue-600 ml-1">→ {p.cuenta_bancaria}</span>}
                                      </div>
                                    ))}
                                    {pagos.length === 0 && <span className="text-xs text-muted-foreground">{metodos || "—"}</span>}
                                  </td>
                                  <td className="py-2 px-2">
                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleViewDetail(venta)}>
                                      <Eye className="w-4 h-4 text-muted-foreground" />
                                    </Button>
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
        </div>
      )}

      {/* Detail dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Detalle — {detailVenta?.clientes?.nombre}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <p className="text-muted-foreground">{detailVenta?.tipo_comprobante} #{detailVenta?.numero} — {detailVenta?.fecha}</p>
            <p className="font-semibold">Total: {formatCurrency(detailVenta?.total || 0)}</p>
            <div className="mt-3">
              <p className="font-medium mb-2">Cobros registrados:</p>
              {detailPagos.length > 0 ? detailPagos.map((p, i) => (
                <div key={i} className="flex justify-between py-1.5 border-b last:border-0">
                  <span>{p.metodo}{p.cuenta_bancaria ? ` → ${p.cuenta_bancaria}` : ""}</span>
                  <span className="font-semibold">{formatCurrency(p.monto)}</span>
                </div>
              )) : <p className="text-muted-foreground">Sin cobros registrados</p>}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── DIALOG: Crear hoja de ruta ─── */}
      <Dialog open={showCrear} onOpenChange={setShowCrear}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nueva hoja de ruta</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input placeholder="Nombre de la hoja (opcional)" value={nombreHoja} onChange={e => setNombreHoja(e.target.value)} />
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Seleccioná las entregas ({selectedVentaIds.size} seleccionadas)</p>
              <div className="space-y-2 max-h-64 overflow-y-auto border rounded-xl p-2">
                {ventasPendientes.length === 0 ? (
                  <p className="text-center text-gray-400 text-sm py-4">No hay entregas pendientes</p>
                ) : ventasPendientes.map(v => {
                  const checked = selectedVentaIds.has(v.id);
                  return (
                    <label key={v.id} className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer border-2 transition-all ${checked ? "border-primary bg-primary/5" : "border-transparent hover:bg-gray-50"}`}>
                      <input type="checkbox" checked={checked} onChange={() => {
                        const next = new Set(selectedVentaIds);
                        if (checked) { next.delete(v.id); setOrdenCreacion(prev => prev.filter(id => id !== v.id)); }
                        else { next.add(v.id); setOrdenCreacion(prev => [...prev, v.id]); }
                        setSelectedVentaIds(next);
                      }} className="mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-gray-900">{v.clientes?.nombre}</p>
                        <p className="text-xs text-gray-400">{v.tipo_comprobante} #{v.numero} — {formatCurrency(v.total)}</p>
                        {v.clientes?.domicilio && <p className="text-xs text-gray-400 truncate"><MapPin className="w-3 h-3 inline mr-1" />{v.clientes.domicilio}</p>}
                        {(v.clientes?.saldo || 0) > 0 && <span className="text-xs text-orange-600 font-medium">Saldo anterior: {formatCurrency(v.clientes!.saldo)}</span>}
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
            {selectedVentaIds.size > 0 && (
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Orden de entrega</p>
                <div className="space-y-1.5 border rounded-xl p-2 bg-gray-50">
                  {ordenCreacion.filter(id => selectedVentaIds.has(id)).map((id, idx) => {
                    const selectedOrden = ordenCreacion.filter(i => selectedVentaIds.has(i));
                    const v = ventasPendientes.find(vv => vv.id === id);
                    return (
                      <div key={id} className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border">
                        <span className="text-xs font-bold text-gray-400 w-5">{idx + 1}</span>
                        <span className="flex-1 text-sm text-gray-800 truncate">{v?.clientes?.nombre}</span>
                        <div className="flex gap-1">
                          <button disabled={idx === 0} onClick={() => {
                            const arr = [...selectedOrden];
                            const j = arr.indexOf(id);
                            [arr[j], arr[j - 1]] = [arr[j - 1], arr[j]];
                            setOrdenCreacion(arr);
                          }} className="text-gray-300 hover:text-gray-600 disabled:opacity-20 text-xs">▲</button>
                          <button disabled={idx === selectedOrden.length - 1} onClick={() => {
                            const arr = [...selectedOrden];
                            const j = arr.indexOf(id);
                            [arr[j], arr[j + 1]] = [arr[j + 1], arr[j]];
                            setOrdenCreacion(arr);
                          }} className="text-gray-300 hover:text-gray-600 disabled:opacity-20 text-xs">▼</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <Button onClick={handleCrearHoja} disabled={selectedVentaIds.size === 0 || creando} className="w-full">
              {creando ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Crear hoja de ruta ({selectedVentaIds.size} entregas)
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── DIALOG: Generar link repartidor ─── */}
      <Dialog open={!!linkDialog?.open} onOpenChange={() => { setLinkDialog(null); setLinkGenerado(""); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Link para repartidor</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Modo</p>
              <div className="space-y-2">
                {([
                  ["solo_ver", "Solo ver", "El repartidor solo puede ver la lista"],
                  ["confirmar", "Confirmar entrega", "Puede marcar como entregado, pero no cobra"],
                  ["confirmar_cobrar", "Confirmar + cobrar", "Puede confirmar y registrar el cobro en caja"],
                ] as const).map(([val, label, desc]) => (
                  <label key={val} className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${modoLink === val ? "border-primary bg-primary/5" : "border-gray-200 hover:border-gray-300"}`}>
                    <input type="radio" name="modo" value={val} checked={modoLink === val} onChange={() => setModoLink(val)} className="mt-0.5" />
                    <div><p className="text-sm font-semibold text-gray-900">{label}</p><p className="text-xs text-gray-500">{desc}</p></div>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Tipo de link</p>
              <div className="grid grid-cols-2 gap-2">
                {([["temporal", "Temporal"], ["fijo", "Fijo (permanente)"]] as const).map(([val, label]) => (
                  <button key={val} onClick={() => setTipoLink(val)}
                    className={`py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${tipoLink === val ? "border-primary bg-primary/5 text-primary" : "border-gray-200 text-gray-500"}`}>
                    {label}
                  </button>
                ))}
              </div>
              {tipoLink === "temporal" && (
                <div className="mt-2 flex items-center gap-2">
                  <label className="text-xs text-gray-500 shrink-0">Expira en</label>
                  <Select value={expiraHoras} onValueChange={(v) => setExpiraHoras(v ?? "24")}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="4">4 horas</SelectItem>
                      <SelectItem value="8">8 horas</SelectItem>
                      <SelectItem value="24">24 horas</SelectItem>
                      <SelectItem value="48">48 horas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {linkGenerado ? (
              <div className="bg-gray-50 border rounded-xl p-3">
                <p className="text-xs text-gray-500 mb-1.5 font-medium">Link generado</p>
                <div className="flex gap-2">
                  <input readOnly value={linkGenerado} className="flex-1 text-xs bg-white border rounded-lg px-2 py-1.5 font-mono" />
                  <button onClick={() => handleCopyLink(linkGenerado)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${copiado ? "bg-emerald-100 text-emerald-700" : "bg-gray-200 text-gray-700 hover:bg-gray-300"}`}>
                    {copiado ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                <Button variant="outline" size="sm" className="w-full mt-2 text-xs" onClick={() => setLinkGenerado("")}>
                  Generar nuevo link
                </Button>
              </div>
            ) : (
              <Button onClick={handleGenerarLink} disabled={generandoLink} className="w-full gap-2">
                {generandoLink ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                Generar link
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
