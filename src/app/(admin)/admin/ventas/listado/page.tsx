"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  FileText,
  Download,
  Loader2,
  Eye,
  DollarSign,
  Receipt,
  Printer,
  Truck,
  CheckCircle,
  Filter,
  Ban,
  AlertTriangle,
} from "lucide-react";
import Link from "next/link";
import { ReceiptPrintView, defaultReceiptConfig } from "@/components/receipt-print-view";
import type { ReceiptConfig, ReceiptLineItem } from "@/components/receipt-print-view";

interface ClienteInfo {
  id: string;
  nombre: string;
  cuit: string | null;
  tipo_factura?: string;
  domicilio?: string | null;
  telefono?: string | null;
  situacion_iva?: string;
  localidad?: string | null;
  provincia?: string | null;
  codigo_postal?: string | null;
  numero_documento?: string | null;
}

interface VentaRow {
  id: string;
  numero: string;
  tipo_comprobante: string;
  fecha: string;
  created_at: string;
  forma_pago: string;
  moneda: string;
  subtotal: number;
  descuento_porcentaje: number;
  recargo_porcentaje: number;
  total: number;
  estado: string;
  observacion: string | null;
  entregado: boolean;
  facturado: boolean;
  cliente_id: string | null;
  vendedor_id: string | null;
  origen: string | null;
  clientes: ClienteInfo | null;
}

interface VentaItemRow {
  id: string;
  producto_id: string | null;
  codigo: string;
  descripcion: string;
  cantidad: number;
  unidad_medida: string | null;
  precio_unitario: number;
  descuento: number;
  subtotal: number;
  presentacion?: string;
  unidades_por_presentacion?: number;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 0 }).format(value);
}

function formatDatePDF(fecha: string) {
  const d = new Date(fecha + "T12:00:00");
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}


export default function ListadoVentasPage() {
  const [ventas, setVentas] = useState<VentaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterOrigen, setFilterOrigen] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [filterPayment, setFilterPayment] = useState("all");
  const [filterMode, setFilterMode] = useState<"day" | "month" | "range" | "all">("month");
  const [filterDay, setFilterDay] = useState(new Date().toISOString().split("T")[0]);
  const [filterMonth, setFilterMonth] = useState(String(new Date().getMonth() + 1));
  const [filterYear, setFilterYear] = useState(String(new Date().getFullYear()));
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [searchClient, setSearchClient] = useState(() => {
    if (typeof window !== "undefined") {
      return new URLSearchParams(window.location.search).get("buscar") || "";
    }
    return "";
  });
  const [showFilters, setShowFilters] = useState(false);

  // Detail
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailVenta, setDetailVenta] = useState<VentaRow | null>(null);
  const [detailItems, setDetailItems] = useState<VentaItemRow[]>([]);
  const [detailComboIds, setDetailComboIds] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Anulacion
  const [anularVenta, setAnularVenta] = useState<VentaRow | null>(null);
  const [anularMotivo, setAnularMotivo] = useState("");
  const [anulando, setAnulando] = useState(false);

  // Print
  const [vendedores, setVendedores] = useState<{ id: string; nombre: string }[]>([]);
  const [receiptConfig, setReceiptConfig] = useState(defaultReceiptConfig);
  const [printVenta, setPrintVenta] = useState<VentaRow | null>(null);
  const [printItems, setPrintItems] = useState<VentaItemRow[]>([]);
  const [printLineItems, setPrintLineItems] = useState<ReceiptLineItem[]>([]);
  const [printReady, setPrintReady] = useState(false);
  const [printClienteSaldo, setPrintClienteSaldo] = useState(0);
  const printRef = useRef<HTMLDivElement>(null);

  const fetchVentas = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("ventas")
      .select("*, created_at, clientes(id, nombre, cuit, tipo_factura, domicilio, telefono, situacion_iva, localidad, provincia, codigo_postal, numero_documento)")
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false });

    if (filterOrigen === "pos") query = query.or("origen.eq.pos,origen.is.null");
    else if (filterOrigen === "tienda") query = query.eq("origen", "tienda");
    if (filterType !== "all") query = query.eq("tipo_comprobante", filterType);
    if (filterPayment !== "all") query = query.eq("forma_pago", filterPayment);

    if (filterMode === "day") {
      query = query.eq("fecha", filterDay);
    } else if (filterMode === "month") {
      const m = filterMonth.padStart(2, "0");
      const start = `${filterYear}-${m}-01`;
      const nextMonth = Number(filterMonth) === 12 ? 1 : Number(filterMonth) + 1;
      const nextYear = Number(filterMonth) === 12 ? Number(filterYear) + 1 : Number(filterYear);
      const end = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
      query = query.gte("fecha", start).lt("fecha", end);
    } else if (filterMode === "range" && filterFrom && filterTo) {
      query = query.gte("fecha", filterFrom).lte("fecha", filterTo);
    }

    const { data } = await query;
    let results = (data as unknown as VentaRow[]) || [];

    if (searchClient) {
      results = results.filter((v) =>
        (v.clientes?.nombre || "").toLowerCase().includes(searchClient.toLowerCase()) ||
        v.numero.toLowerCase().includes(searchClient.toLowerCase())
      );
    }

    setVentas(results);
    setLoading(false);
  }, [filterOrigen, filterType, filterPayment, filterMode, filterDay, filterMonth, filterYear, filterFrom, filterTo, searchClient]);

  useEffect(() => { fetchVentas(); }, [fetchVentas]);

  useEffect(() => {
    supabase.from("usuarios").select("id, nombre").eq("activo", true).then(({ data }) => setVendedores(data || []));
    // Load saved receipt config
    try {
      const stored = localStorage.getItem("receipt_config");
      if (stored) setReceiptConfig((prev) => ({ ...prev, ...JSON.parse(stored) }));
    } catch {}
  }, []);

  const openDetail = async (v: VentaRow) => {
    setDetailVenta(v);
    const { data } = await supabase.from("venta_items").select("*").eq("venta_id", v.id).order("created_at");
    const items = (data as VentaItemRow[]) || [];
    setDetailItems(items);

    // Check for combos
    const productIds = items.map((i) => i.producto_id).filter(Boolean) as string[];
    if (productIds.length > 0) {
      const { data: prods } = await supabase.from("productos").select("id, es_combo").in("id", productIds);
      const cIds = new Set<string>();
      for (const p of prods || []) { if ((p as any).es_combo) cIds.add(p.id); }
      setDetailComboIds(cIds);
    } else {
      setDetailComboIds(new Set());
    }

    setDetailOpen(true);
  };

  const marcarEntregado = async (v: VentaRow) => {
    setActionLoading(v.id);
    await supabase.from("ventas").update({ entregado: true }).eq("id", v.id);
    await fetchVentas();
    setActionLoading(null);
  };

  const handleAnular = async () => {
    if (!anularVenta) return;
    setAnulando(true);
    const v = anularVenta;
    try {
      // 1. Get venta_items to reverse stock
      const { data: vitems } = await supabase.from("venta_items").select("*").eq("venta_id", v.id);
      const items = (vitems as VentaItemRow[]) || [];

      // 2. Reverse stock for each item
      for (const item of items) {
        if (!item.producto_id) continue;
        const { data: prod } = await supabase.from("productos").select("id, stock, es_combo").eq("id", item.producto_id).single();
        if (!prod) continue;

        if ((prod as any).es_combo) {
          // Combo: reverse each component
          const { data: comboItems } = await supabase
            .from("combo_items")
            .select("producto_id, cantidad, productos!combo_items_producto_id_fkey(nombre)")
            .eq("combo_id", item.producto_id);
          for (const ci of comboItems || []) {
            const { data: compProd } = await supabase.from("productos").select("id, stock").eq("id", (ci as any).producto_id).single();
            if (!compProd) continue;
            const unitsToRestore = item.cantidad * (ci as any).cantidad;
            const newStock = compProd.stock + unitsToRestore;
            await supabase.from("productos").update({ stock: newStock }).eq("id", (ci as any).producto_id);
            await supabase.from("stock_movimientos").insert({
              producto_id: (ci as any).producto_id,
              tipo: "anulacion",
              cantidad_antes: compProd.stock,
              cantidad_despues: newStock,
              cantidad: unitsToRestore,
              referencia: `Anulación Venta #${v.numero}`,
              descripcion: `Anulación venta - ${(ci as any).productos?.nombre || item.descripcion}${anularMotivo ? ` (${anularMotivo})` : ""}`,
              usuario: "Admin Sistema",
              orden_id: v.id,
            });
          }
        } else {
          // Regular product
          const upp = item.unidades_por_presentacion || 1;
          const unitsToRestore = item.cantidad * upp;
          const newStock = prod.stock + unitsToRestore;
          await supabase.from("productos").update({ stock: newStock }).eq("id", item.producto_id);
          await supabase.from("stock_movimientos").insert({
            producto_id: item.producto_id,
            tipo: "anulacion",
            cantidad_antes: prod.stock,
            cantidad_despues: newStock,
            cantidad: unitsToRestore,
            referencia: `Anulación Venta #${v.numero}`,
            descripcion: `Anulación venta - ${item.descripcion}${anularMotivo ? ` (${anularMotivo})` : ""}`,
            usuario: "Admin Sistema",
            orden_id: v.id,
          });
        }
      }

      // 3. Reverse caja_movimientos (delete ingreso entries for this sale)
      const { data: cajaRows } = await supabase
        .from("caja_movimientos")
        .select("*")
        .eq("referencia_id", v.id)
        .eq("referencia_tipo", "venta");
      for (const cm of cajaRows || []) {
        const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
        const hora = new Date().toTimeString().split(" ")[0];
        await supabase.from("caja_movimientos").insert({
          fecha: hoy,
          hora,
          tipo: "egreso",
          descripcion: `Anulación Venta #${v.numero}${anularMotivo ? ` (${anularMotivo})` : ""}`,
          metodo_pago: (cm as any).metodo_pago,
          monto: (cm as any).monto,
          referencia_id: v.id,
          referencia_tipo: "anulacion",
          cuenta_bancaria: (cm as any).cuenta_bancaria || null,
        });
      }

      // 4. Reverse cuenta_corriente entries and update client saldo
      if (v.cliente_id) {
        const { data: ccRows } = await supabase
          .from("cuenta_corriente")
          .select("*")
          .eq("venta_id", v.id);
        if (ccRows && ccRows.length > 0) {
          // Get current client saldo
          const { data: clienteData } = await supabase.from("clientes").select("saldo").eq("id", v.cliente_id).single();
          let saldoActual = clienteData?.saldo || 0;

          for (const cc of ccRows) {
            const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
            // Reverse: what was debe becomes haber and vice versa
            const nuevoSaldo = saldoActual - (cc as any).debe + (cc as any).haber;
            await supabase.from("cuenta_corriente").insert({
              cliente_id: v.cliente_id,
              fecha: hoy,
              comprobante: `Anulación Venta #${v.numero}`,
              descripcion: `Anulación de venta${anularMotivo ? ` (${anularMotivo})` : ""}`,
              debe: (cc as any).haber,
              haber: (cc as any).debe,
              saldo: nuevoSaldo,
              forma_pago: "Anulación",
              venta_id: v.id,
            });
            saldoActual = nuevoSaldo;
          }
          // Update client balance
          await supabase.from("clientes").update({ saldo: saldoActual }).eq("id", v.cliente_id);
        }
      }

      // 5. Mark venta as anulada
      await supabase.from("ventas").update({
        estado: "anulada",
        observacion: v.observacion
          ? `${v.observacion} | ANULADA${anularMotivo ? `: ${anularMotivo}` : ""}`
          : `ANULADA${anularMotivo ? `: ${anularMotivo}` : ""}`,
      }).eq("id", v.id);

      setAnularVenta(null);
      setAnularMotivo("");
      await fetchVentas();
    } catch (err: any) {
      alert(`Error al anular: ${err?.message || String(err)}`);
    } finally {
      setAnulando(false);
    }
  };

  const getVendedorNombre = (id: string | null) => {
    if (!id) return "—";
    return vendedores.find((v) => v.id === id)?.nombre || "—";
  };

  // ─── Print ───
  const preparePrint = async (v: VentaRow) => {
    const { data } = await supabase.from("venta_items").select("*").eq("venta_id", v.id).order("created_at");
    const items = (data as VentaItemRow[]) || [];
    let saldo = 0;
    if (v.cliente_id) {
      const { data: cd } = await supabase.from("clientes").select("saldo").eq("id", v.cliente_id).single();
      saldo = cd?.saldo || 0;
    }

    // Load combo data for combo products
    const productIds = items.map((i) => i.producto_id).filter(Boolean) as string[];
    const comboItemsMap: Record<string, { nombre: string; cantidad: number }[]> = {};
    const comboIds = new Set<string>();
    if (productIds.length > 0) {
      const { data: prods } = await supabase.from("productos").select("id, es_combo").in("id", productIds);
      for (const p of prods || []) {
        if ((p as any).es_combo) comboIds.add(p.id);
      }
      for (const comboId of comboIds) {
        const { data: ciData } = await supabase
          .from("combo_items")
          .select("cantidad, productos!combo_items_producto_id_fkey(nombre)")
          .eq("combo_id", comboId);
        comboItemsMap[comboId] = (ciData || []).map((ci: any) => ({ nombre: ci.productos?.nombre || "", cantidad: ci.cantidad }));
      }
    }

    const lineItems: ReceiptLineItem[] = items.map((item) => ({
      id: item.id,
      producto_id: item.producto_id || "",
      code: item.codigo,
      description: item.descripcion,
      qty: item.cantidad,
      unit: item.unidad_medida || "Un",
      price: item.precio_unitario,
      discount: item.descuento,
      subtotal: item.subtotal,
      presentacion: (item as any).presentacion || "",
      unidades_por_presentacion: (item as any).unidades_por_presentacion ?? 1,
      stock: 0,
      es_combo: comboIds.has(item.producto_id || ""),
      comboItems: comboItemsMap[item.producto_id || ""] || [],
    }));

    setPrintClienteSaldo(saldo);
    setPrintVenta(v);
    setPrintItems(items);
    setPrintLineItems(lineItems);
    setPrintReady(true);
  };

  useEffect(() => {
    if (printReady && printRef.current) {
      const timeout = setTimeout(() => {
        const win = window.open("", "_blank");
        if (!win) return;
        const content = printRef.current!.innerHTML;
        win.document.write(`<!DOCTYPE html><html><head><title>Remito ${printVenta?.numero || ""}</title><style>@page{size:A4;margin:0}body{margin:0}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body>${content}</body></html>`);
        win.document.close();
        win.focus();
        win.print();
        setPrintReady(false);
      }, 100);
      return () => clearTimeout(timeout);
    }
  }, [printReady, printVenta]);

  const exportCSV = () => {
    const header = "Tipo,N° Comprobante,Fecha,Cliente,Forma Pago,Total\n";
    const rows = ventas.map((v) =>
      `"${v.tipo_comprobante}","${v.numero}","${v.fecha}","${v.clientes?.nombre || ""}","${v.forma_pago}",${v.total}`
    ).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `ventas_${filterYear}_${filterMonth}.csv`;
    a.click();
  };

  // ─── Derived ───
  const ventasActivas = ventas.filter((v) => v.estado !== "anulada");
  const totalSum = ventasActivas.reduce((a, v) => {
    const isNC = v.tipo_comprobante.includes("Nota de Crédito");
    return a + (isNC ? -v.total : v.total);
  }, 0);
  const pendientesEntrega = ventasActivas.filter((v) => !v.entregado).length;
  const months = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

  return (
    <div className="p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Listado de Ventas y Remitos</h1>
          <p className="text-muted-foreground text-sm">
            {ventas.length} comprobantes encontrados
            {ventas.length !== ventasActivas.length && ` (${ventas.length - ventasActivas.length} anulados)`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="w-4 h-4 mr-2" />Exportar CSV
          </Button>
          <Link href="/admin/ventas">
            <Button size="sm">Nueva venta</Button>
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><Receipt className="w-5 h-5 text-primary" /></div>
            <div><p className="text-xs text-muted-foreground">Comprobantes</p><p className="text-xl font-bold">{ventasActivas.length}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center"><DollarSign className="w-5 h-5 text-emerald-500" /></div>
            <div><p className="text-xs text-muted-foreground">Total</p><p className="text-xl font-bold">{formatCurrency(totalSum)}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center"><Truck className="w-5 h-5 text-amber-500" /></div>
            <div><p className="text-xs text-muted-foreground">Pendientes entrega</p><p className="text-xl font-bold">{pendientesEntrega}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center"><FileText className="w-5 h-5 text-violet-500" /></div>
            <div><p className="text-xs text-muted-foreground">Promedio por ticket</p><p className="text-xl font-bold">{ventasActivas.length > 0 ? formatCurrency(totalSum / ventasActivas.length) : "$0"}</p></div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6 space-y-4 overflow-visible">
          <div className="flex items-end gap-4">
            <div className="flex-1 max-w-md space-y-1.5">
              <span className="text-xs text-muted-foreground font-semibold tracking-wide">BUSCAR</span>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Buscar número / cliente..." value={searchClient} onChange={(e) => setSearchClient(e.target.value)} className="pl-9" />
              </div>
            </div>
            <Button variant={showFilters ? "default" : "outline"} className={showFilters ? "bg-blue-600 hover:bg-blue-700 text-white" : "text-blue-600 border-blue-600 hover:bg-blue-50"} onClick={() => setShowFilters(!showFilters)}>
              <Filter className="w-4 h-4 mr-2" />Filtros
            </Button>
          </div>
          {showFilters && (
            <div className="border-t pt-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 overflow-visible">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground font-semibold tracking-wide uppercase">Origen</Label>
                  <Select value={filterOrigen} onValueChange={(v) => setFilterOrigen(v ?? "all")}>
                    <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="pos">Punto de Venta</SelectItem>
                      <SelectItem value="tienda">Tienda Online</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground font-semibold tracking-wide uppercase">Tipo de comprobante</Label>
                  <Select value={filterType} onValueChange={(v) => setFilterType(v ?? "all")}>
                    <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="Remito X">Remito X</SelectItem>
                      <SelectItem value="Pedido Web">Pedido Web</SelectItem>
                      <SelectItem value="Nota de Crédito B">Nota de Crédito B</SelectItem>
                      <SelectItem value="Nota de Crédito C">Nota de Crédito C</SelectItem>
                      <SelectItem value="Nota de Débito B">Nota de Débito B</SelectItem>
                      <SelectItem value="Nota de Débito C">Nota de Débito C</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground font-semibold tracking-wide uppercase">Forma de cobro</Label>
                  <Select value={filterPayment} onValueChange={(v) => setFilterPayment(v ?? "all")}>
                    <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas</SelectItem>
                      <SelectItem value="Efectivo">Efectivo</SelectItem>
                      <SelectItem value="Transferencia">Transferencia</SelectItem>
                      <SelectItem value="Cuenta Corriente">Cuenta Corriente</SelectItem>
                      <SelectItem value="Mixto">Mixto</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground font-semibold tracking-wide uppercase">Período</Label>
                  <Select value={filterMode} onValueChange={(v) => setFilterMode((v ?? "day") as "day" | "month" | "range" | "all")}>
                    <SelectTrigger><SelectValue placeholder="Mensual" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="day">Día</SelectItem>
                      <SelectItem value="month">Mensual</SelectItem>
                      <SelectItem value="range">Entre fechas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {filterMode === "day" && (
                <div className="flex gap-2 mt-3 items-center">
                  <Label className="text-xs">Fecha</Label>
                  <Input type="date" value={filterDay} onChange={(e) => setFilterDay(e.target.value)} className="w-44" />
                </div>
              )}
              {filterMode === "month" && (
                <div className="flex gap-2 mt-3">
                  <Select value={filterMonth} onValueChange={(v) => setFilterMonth(v ?? "1")}>
                    <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {months.map((m, i) => (<SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>))}
                    </SelectContent>
                  </Select>
                  <Input type="number" value={filterYear} onChange={(e) => setFilterYear(e.target.value)} className="w-24" />
                </div>
              )}
              {filterMode === "range" && (
                <div className="flex gap-2 mt-3 items-center">
                  <Label className="text-xs">Desde</Label>
                  <Input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} className="w-40" />
                  <Label className="text-xs">Hasta</Label>
                  <Input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} className="w-40" />
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="pt-0">
          {loading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : ventas.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">No se encontraron comprobantes</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-3 px-4 font-medium">Origen</th>
                    <th className="text-left py-3 px-4 font-medium">Tipo</th>
                    <th className="text-left py-3 px-4 font-medium">N°</th>
                    <th className="text-left py-3 px-4 font-medium">Fecha / Hora</th>
                    <th className="text-left py-3 px-4 font-medium">Cliente</th>
                    <th className="text-left py-3 px-4 font-medium">Forma pago</th>
                    <th className="text-center py-3 px-4 font-medium">Entrega</th>
                    <th className="text-right py-3 px-4 font-medium">Total</th>
                    <th className="text-right py-3 px-4 font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {ventas.map((v) => (
                    <tr key={v.id} className={`border-b last:border-0 transition-colors ${v.estado === "anulada" ? "opacity-50 bg-red-50/50" : "hover:bg-muted/50"}`}>
                      <td className="py-3 px-4">
                        <Badge variant="outline" className={`text-xs font-normal ${v.origen === "tienda" ? "border-pink-300 text-pink-700 bg-pink-50" : "border-blue-300 text-blue-700 bg-blue-50"}`}>
                          {v.origen === "tienda" ? "Tienda" : "POS"}
                        </Badge>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <Badge variant={v.tipo_comprobante.includes("Nota de Crédito") ? "destructive" : "secondary"} className="text-xs font-normal">
                            {v.tipo_comprobante}
                          </Badge>
                          {v.estado === "anulada" && (
                            <Badge variant="destructive" className="text-[10px] font-bold">ANULADA</Badge>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-muted-foreground">{v.numero}</td>
                      <td className="py-3 px-4 text-muted-foreground">
                        <div>{new Date(v.fecha + "T12:00:00").toLocaleDateString("es-AR")}</div>
                        {v.created_at && (
                          <div className="text-xs text-muted-foreground/70">
                            {new Date(v.created_at).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Argentina/Buenos_Aires" })}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 font-medium">{v.clientes?.nombre || "—"}</td>
                      <td className="py-3 px-4">
                        <Badge variant="outline" className="text-xs font-normal">{v.forma_pago}</Badge>
                      </td>
                      <td className="py-3 px-4 text-center">
                        {v.tipo_comprobante.includes("Nota de Crédito") ? (
                          <Badge variant="outline" className="text-xs">N/A</Badge>
                        ) : (
                          <Badge variant={v.entregado ? "default" : "secondary"} className="text-xs">
                            {v.entregado ? "Entregado" : "Pendiente"}
                          </Badge>
                        )}
                      </td>
                      <td className={`py-3 px-4 text-right font-semibold ${v.estado === "anulada" ? "line-through text-muted-foreground" : v.tipo_comprobante.includes("Nota de Crédito") ? "text-red-500" : ""}`}>
                        {v.tipo_comprobante.includes("Nota de Crédito") ? `-${formatCurrency(v.total)}` : formatCurrency(v.total)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openDetail(v)} title="Ver detalle">
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => preparePrint(v)} title="Imprimir">
                            <Printer className="w-3.5 h-3.5" />
                          </Button>
                          {!v.entregado && !v.tipo_comprobante.includes("Nota de Crédito") && v.estado !== "anulada" && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs"
                              disabled={actionLoading === v.id}
                              onClick={() => marcarEntregado(v)}
                            >
                              {actionLoading === v.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3 mr-1" />}
                              Entregar
                            </Button>
                          )}
                          {v.estado !== "anulada" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                              onClick={() => { setAnularVenta(v); setAnularMotivo(""); }}
                              title="Anular comprobante"
                            >
                              <Ban className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {ventas.length > 0 && (
                <div className="flex justify-end border-t pt-3 mt-1 px-4">
                  <span className="text-sm text-muted-foreground mr-4">Total:</span>
                  <span className="text-sm font-bold">{formatCurrency(totalSum)}</span>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="truncate">Comprobante {detailVenta?.numero}</DialogTitle>
          </DialogHeader>
          {detailVenta && (
            <div className="w-full overflow-hidden space-y-4">
              {detailVenta.estado === "anulada" && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2">
                  <Ban className="w-4 h-4 text-red-600" />
                  <span className="text-sm font-semibold text-red-700">COMPROBANTE ANULADO</span>
                </div>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                <div><span className="text-muted-foreground">Tipo:</span> <span className="font-medium ml-1">{detailVenta.tipo_comprobante}</span></div>
                <div><span className="text-muted-foreground">Fecha:</span> <span className="font-medium ml-1">{new Date(detailVenta.fecha + "T12:00:00").toLocaleDateString("es-AR")}</span></div>
                <div><span className="text-muted-foreground">Pago:</span> <span className="font-medium ml-1">{detailVenta.forma_pago}</span></div>
                <div><span className="text-muted-foreground">Entrega:</span> <Badge variant={detailVenta.entregado ? "default" : "secondary"} className="ml-1">{detailVenta.entregado ? "Entregado" : "Pendiente"}</Badge></div>
              </div>
              <div className="text-sm"><span className="text-muted-foreground">Cliente:</span> <span className="font-medium ml-1">{detailVenta.clientes?.nombre || "—"}</span></div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => { setDetailOpen(false); preparePrint(detailVenta); }}>
                  <Printer className="w-3.5 h-3.5 mr-1.5" />Imprimir
                </Button>
              </div>
              <div className="overflow-x-auto border rounded-lg">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-muted-foreground">
                      <th className="text-left py-2 px-3 font-medium">Código</th>
                      <th className="text-left py-2 px-3 font-medium">Artículo</th>
                      <th className="text-center py-2 px-3 font-medium">Cant</th>
                      <th className="text-right py-2 px-3 font-medium">Precio</th>
                      <th className="text-right py-2 px-3 font-medium">Desc.%</th>
                      <th className="text-right py-2 px-3 font-medium">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailItems.map((item) => {
                      const cleanDesc = item.descripcion
                        .replace(/\s*[-–]\s*Unidad(\s*\(Unidad\))?$/, "")
                        .replace(/\s*\(Unidad\)$/, "")
                        .replace(/(\([^)]+\))\s*\1/gi, "$1")
                        .replace(/Caja\s*\(?x?0\.5\)?/gi, "Medio Cartón")
                        .replace(/(Medio\s*Cart[oó]n)\s*\(?\s*Medio\s*Cart[oó]n\s*\)?/gi, "$1");
                      const isCombo = detailComboIds.has(item.producto_id || "");
                      const upp = item.unidades_por_presentacion ?? 1;
                      const displayQty = upp > 0 && upp < 1 ? item.cantidad * upp : item.cantidad;
                      return (
                      <tr key={item.id} className="border-b last:border-0">
                        <td className="py-2 px-3 font-mono text-xs text-muted-foreground">{item.codigo}</td>
                        <td className="py-2 px-3">
                          {isCombo && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-black text-white mr-1.5 tracking-wider">COMBO</span>
                          )}
                          {cleanDesc}
                        </td>
                        <td className="py-2 px-3 text-center">{displayQty}</td>
                        <td className="py-2 px-3 text-right">{formatCurrency(item.precio_unitario)}</td>
                        <td className="py-2 px-3 text-right">{item.descuento > 0 ? `(-${item.descuento}%)` : ""}</td>
                        <td className="py-2 px-3 text-right font-semibold">{formatCurrency(item.subtotal)}</td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end text-lg font-bold">
                Total: {formatCurrency(detailVenta.total)}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Anular Dialog */}
      <Dialog open={!!anularVenta} onOpenChange={(open) => { if (!open) setAnularVenta(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5" />
              Anular comprobante
            </DialogTitle>
          </DialogHeader>
          {anularVenta && (
            <div className="space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm space-y-2">
                <p className="font-medium text-red-800">Esta acción revertirá:</p>
                <ul className="list-disc list-inside text-red-700 space-y-1">
                  <li>El stock de los productos será restaurado</li>
                  <li>Se generará un egreso en caja para compensar</li>
                  {anularVenta.forma_pago === "Cuenta Corriente" || anularVenta.forma_pago === "Mixto" ? (
                    <li>Se revertirá el movimiento en cuenta corriente del cliente</li>
                  ) : null}
                </ul>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Comprobante:</span> <span className="font-medium">{anularVenta.numero}</span></div>
                <div><span className="text-muted-foreground">Total:</span> <span className="font-bold">{formatCurrency(anularVenta.total)}</span></div>
                <div><span className="text-muted-foreground">Cliente:</span> <span className="font-medium">{anularVenta.clientes?.nombre || "—"}</span></div>
                <div><span className="text-muted-foreground">Pago:</span> <span className="font-medium">{anularVenta.forma_pago}</span></div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Motivo de anulación (opcional)</Label>
                <Input
                  placeholder="Ej: Error en el monto, devolución del cliente..."
                  value={anularMotivo}
                  onChange={(e) => setAnularMotivo(e.target.value)}
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setAnularVenta(null)} disabled={anulando}>
                  Cancelar
                </Button>
                <Button variant="destructive" onClick={handleAnular} disabled={anulando}>
                  {anulando ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Ban className="w-4 h-4 mr-2" />}
                  Confirmar anulación
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Hidden print area */}
      {printVenta && (
        <div style={{ position: "fixed", left: "-9999px", top: 0 }} ref={printRef}>
          <ReceiptPrintView
            config={receiptConfig}
            sale={{
              numero: printVenta.numero,
              total: printVenta.total,
              subtotal: printVenta.subtotal,
              descuento: Math.round(printVenta.subtotal * (printVenta.descuento_porcentaje || 0) / 100),
              recargo: Math.round(printVenta.subtotal * (printVenta.recargo_porcentaje || 0) / 100),
              transferSurcharge: 0,
              tipoComprobante: printVenta.tipo_comprobante,
              formaPago: printVenta.forma_pago,
              moneda: printVenta.moneda || "ARS",
              cliente: printVenta.clientes?.nombre || "Consumidor Final",
              clienteDireccion: printVenta.clientes?.domicilio || null,
              clienteTelefono: printVenta.clientes?.telefono || null,
              clienteCondicionIva: printVenta.clientes?.situacion_iva || null,
              vendedor: getVendedorNombre(printVenta.vendedor_id),
              fecha: formatDatePDF(printVenta.fecha),
              saldoAnterior: printClienteSaldo,
              saldoNuevo: printClienteSaldo,
              items: printLineItems,
            }}
          />
        </div>
      )}
    </div>
  );
}
