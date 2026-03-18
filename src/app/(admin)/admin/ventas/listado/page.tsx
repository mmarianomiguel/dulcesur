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
} from "lucide-react";
import type { Empresa } from "@/types/database";
import Link from "next/link";

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
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 0 }).format(value);
}

function formatDatePDF(fecha: string) {
  const d = new Date(fecha + "T12:00:00");
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

// ─── Receipt config (same as POS) ───
interface ReceiptConfig {
  logoUrl: string;
  empresaNombre: string;
  empresaWeb: string;
  empresaDomicilio: string;
  empresaTelefono: string;
  empresaCuit: string;
  empresaIva: string;
  empresaInicioAct: string;
  empresaIngrBrutos: string;
  footerTexto: string;
  fontSize: number;
  logoHeight: number;
  mostrarLogo: boolean;
  mostrarVendedor: boolean;
  mostrarDescuento: boolean;
}

const defaultReceiptConfig: ReceiptConfig = {
  logoUrl: "https://www.dulcesur.com/assets/logotipo.png",
  empresaNombre: "DULCE SUR",
  empresaWeb: "www.dulcesur.com",
  empresaDomicilio: "Francisco Canaro 4012",
  empresaTelefono: "116299-1571",
  empresaCuit: "20443387898",
  empresaIva: "Monotributista Social",
  empresaInicioAct: "15/2/2021",
  empresaIngrBrutos: "20443387898",
  footerTexto: "Gracias por su compra",
  fontSize: 12,
  logoHeight: 60,
  mostrarLogo: true,
  mostrarVendedor: true,
  mostrarDescuento: true,
};

interface LineItem {
  id: string;
  producto_id: string;
  code: string;
  description: string;
  qty: number;
  unit: string;
  price: number;
  discount: number;
  subtotal: number;
  presentacion: string;
  unidades_por_presentacion: number;
  stock: number;
  es_combo?: boolean;
  comboItems?: { nombre: string; cantidad: number }[];
}

function ReceiptPrintView({
  sale,
  config,
}: {
  sale: {
    numero: string; total: number; subtotal: number; descuento: number; recargo: number;
    transferSurcharge: number; tipoComprobante: string; formaPago: string;
    cliente: string; vendedor: string; items: LineItem[]; fecha: string;
    saldoAnterior: number; saldoNuevo: number;
  };
  config: ReceiptConfig;
}) {
  const fs = config.fontSize;
  const fmtCur = (v: number) =>
    new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 0 }).format(v);

  return (
    <div
      style={{
        width: "210mm",
        minHeight: "297mm",
        padding: "8mm 10mm",
        fontFamily: "Arial, Helvetica, sans-serif",
        fontSize: `${fs}px`,
        color: "#000",
        background: "#fff",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* ── Header ── */}
      <div style={{ display: "flex", borderBottom: "2px solid #000", paddingBottom: "6px", marginBottom: "4px" }}>
        {/* Left: Logo & company */}
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
            {config.mostrarLogo && config.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={config.logoUrl} alt="Logo" style={{ height: `${config.logoHeight}px` }} />
            )}
            {!config.mostrarLogo && (
              <div style={{ fontSize: `${fs + 8}px`, fontWeight: "bold" }}>{config.empresaNombre}</div>
            )}
          </div>
          <div style={{ fontSize: `${fs - 2}px`, lineHeight: "1.5" }}>
            {config.empresaWeb && <div style={{ fontWeight: "bold" }}>{config.empresaWeb}</div>}
            <div>{config.empresaDomicilio} | Tel: {config.empresaTelefono}</div>
          </div>
        </div>

        {/* Center: X */}
        <div style={{ width: "55px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", borderLeft: "2px solid #000", borderRight: "2px solid #000", padding: "0 8px" }}>
          <div style={{ fontSize: "30px", fontWeight: "bold", lineHeight: 1 }}>X</div>
          <div style={{ fontSize: "8px", textAlign: "center", lineHeight: "1.2", marginTop: "2px" }}>Documento no válido como factura</div>
        </div>

        {/* Right: Number & fiscal data */}
        <div style={{ flex: 1, paddingLeft: "10px" }}>
          <div style={{ fontSize: `${fs + 4}px`, fontWeight: "bold", marginBottom: "4px" }}>
            {sale.tipoComprobante}
          </div>
          <div style={{ fontSize: `${fs + 2}px`, fontWeight: "bold", marginBottom: "4px" }}>
            N° {sale.numero}
          </div>
          <div style={{ fontSize: `${fs - 2}px`, lineHeight: "1.6" }}>
            <div>Fecha: {sale.fecha}</div>
            <div>CUIT: {config.empresaCuit}</div>
            <div>Ing.Brutos: {config.empresaIngrBrutos}</div>
            <div>Cond.IVA: {config.empresaIva}</div>
            <div>Inicio de Actividad: {config.empresaInicioAct}</div>
          </div>
        </div>
      </div>

      {/* ── Client info ── */}
      <div style={{ border: "1px solid #ccc", padding: "4px 6px", marginBottom: "4px", fontSize: `${fs - 1}px`, lineHeight: "1.7" }}>
        <div style={{ display: "flex", gap: "20px" }}>
          <div style={{ flex: 1 }}><span>Cliente: {sale.cliente}</span></div>
          <div><span>Forma de pago: {sale.formaPago}</span></div>
        </div>
        {config.mostrarVendedor && sale.vendedor && (
          <div><span>Vendedor: {sale.vendedor}</span></div>
        )}
      </div>

      {/* ── Items table ── */}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: `${fs - 1}px`, flex: 1 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid #000", borderTop: "1px solid #000" }}>
            <th style={{ textAlign: "left", padding: "4px 4px", fontWeight: "bold" }}>Cant.</th>
            <th style={{ textAlign: "left", padding: "4px 4px", fontWeight: "bold" }}>Producto</th>
            <th style={{ textAlign: "center", padding: "4px 4px", fontWeight: "bold" }}>U/Med</th>
            <th style={{ textAlign: "right", padding: "4px 4px", fontWeight: "bold" }}>Precio Un.</th>
            {config.mostrarDescuento && (
              <th style={{ textAlign: "right", padding: "4px 4px", fontWeight: "bold" }}>Desc.%</th>
            )}
            <th style={{ textAlign: "right", padding: "4px 4px", fontWeight: "bold" }}>Importe</th>
          </tr>
        </thead>
        <tbody>
          {sale.items.map((item, i) => {
            const totalComboUnits = item.es_combo && item.comboItems && item.comboItems.length > 0
              ? item.comboItems.reduce((s, ci) => s + ci.cantidad, 0)
              : 0;
            const precioUnitario = item.es_combo && totalComboUnits > 0
              ? item.price / totalComboUnits
              : item.unit === "Mt" && item.unidades_por_presentacion < 1
                ? item.price / item.unidades_por_presentacion
                : item.price;
            const cleanDescription = item.description
              .replace(/\s*[-–]\s*Unidad(\s*\(Unidad\))?$/, "")
              .replace(/\s*\(Unidad\)$/, "");
            return (
              <tr key={i} style={{ borderBottom: "1px solid #eee" }}>
                <td style={{ padding: "3px 4px", textAlign: "left" }}>{item.unit === "Mt" && item.unidades_por_presentacion < 1 ? item.qty * item.unidades_por_presentacion : item.qty}</td>
                <td style={{ padding: "3px 4px", textAlign: "left" }}>
                  {item.es_combo && (
                    <span style={{ fontSize: `${fs - 4}px`, fontWeight: "bold", background: "#000", color: "#fff", padding: "0px 2px", borderRadius: "2px", marginRight: "3px", letterSpacing: "0.5px" }}>COMBO</span>
                  )}
                  {cleanDescription}
                  {item.es_combo && item.comboItems && item.comboItems.length > 0 && (
                    <div style={{ fontSize: `${fs - 4}px`, color: "#777", marginTop: "0px", lineHeight: "1.1" }}>
                      {item.comboItems.map((ci) => `${ci.nombre} x${ci.cantidad}`).join(" · ")}
                    </div>
                  )}
                </td>
                <td style={{ padding: "3px 4px", textAlign: "center" }}>
                  {item.es_combo && totalComboUnits > 0 ? `x${totalComboUnits} un` : item.unit || "Un"}
                </td>
                <td style={{ padding: "3px 4px", textAlign: "right" }}>{fmtCur(precioUnitario)}</td>
                {config.mostrarDescuento && (
                  <td style={{ padding: "3px 4px", textAlign: "right" }}>{item.discount || 0}</td>
                )}
                <td style={{ padding: "3px 4px", textAlign: "right" }}>{fmtCur(item.subtotal)}</td>
              </tr>
            );
          })}
          {/* Empty rows to fill space */}
          {sale.items.length < 20 &&
            Array.from({ length: 20 - sale.items.length }).map((_, i) => (
              <tr key={`empty-${i}`}>
                <td style={{ padding: "3px 4px" }}>&nbsp;</td>
                <td style={{ padding: "3px 4px" }}></td>
                <td style={{ padding: "3px 4px" }}></td>
                <td style={{ padding: "3px 4px" }}></td>
                {config.mostrarDescuento && <td style={{ padding: "3px 4px" }}></td>}
                <td style={{ padding: "3px 4px" }}></td>
              </tr>
            ))}
        </tbody>
      </table>

      {/* ── Footer totals ── */}
      <div style={{ borderTop: "2px solid #000", marginTop: "auto" }}>
        <div style={{ display: "flex", justifyContent: "flex-end", padding: "6px 4px", fontSize: `${fs}px`, gap: "30px" }}>
          <div>
            <span>Subtotal: </span>
            <span style={{ fontWeight: "bold" }}>{fmtCur(sale.subtotal)}</span>
          </div>
          {sale.descuento > 0 && (
            <div>
              <span>Descuento: </span>
              <span style={{ fontWeight: "bold" }}>-{fmtCur(sale.descuento)}</span>
            </div>
          )}
          {sale.recargo > 0 && (
            <div>
              <span>Recargo: </span>
              <span style={{ fontWeight: "bold" }}>+{fmtCur(sale.recargo)}</span>
            </div>
          )}
          {sale.transferSurcharge > 0 && (
            <div>
              <span>Rec. Transferencia: </span>
              <span style={{ fontWeight: "bold" }}>+{fmtCur(sale.transferSurcharge)}</span>
            </div>
          )}
        </div>
        <div style={{ borderTop: "2px solid #000", display: "flex", justifyContent: "flex-end", padding: "8px 4px" }}>
          <div style={{ fontSize: `${fs + 6}px`, fontWeight: "bold" }}>
            TOTAL: {fmtCur(sale.total)}
          </div>
        </div>
        {/* Saldo info for Cuenta Corriente */}
        {(sale.formaPago === "Cuenta Corriente" || (sale.formaPago === "Mixto" && sale.saldoNuevo !== sale.saldoAnterior)) && (
          <div style={{ borderTop: "1px solid #ccc", padding: "6px 4px", fontSize: `${fs - 1}px` }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
              <span>Saldo anterior:</span>
              <span>{sale.saldoAnterior < 0 ? `${fmtCur(Math.abs(sale.saldoAnterior))} (a favor)` : fmtCur(sale.saldoAnterior)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "bold" }}>
              <span>Saldo actual:</span>
              <span style={{ color: sale.saldoNuevo < 0 ? "#059669" : sale.saldoNuevo > 0 ? "#ea580c" : "#000" }}>
                {sale.saldoNuevo < 0 ? `${fmtCur(Math.abs(sale.saldoNuevo))} (a favor)` : fmtCur(sale.saldoNuevo)}
              </span>
            </div>
          </div>
        )}
        <div style={{ textAlign: "center", padding: "8px 0", fontSize: `${fs - 2}px`, borderTop: "1px solid #ccc" }}>
          <div>{config.footerTexto}</div>
          <div style={{ marginTop: "2px" }}>{sale.items.length} artículo{sale.items.length !== 1 ? "s" : ""}</div>
        </div>
      </div>
    </div>
  );
}

export default function ListadoVentasPage() {
  const [ventas, setVentas] = useState<VentaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterOrigen, setFilterOrigen] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [filterPayment, setFilterPayment] = useState("all");
  const [filterMode, setFilterMode] = useState<"month" | "range" | "all">("month");
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
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Print
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [vendedores, setVendedores] = useState<{ id: string; nombre: string }[]>([]);
  const [printVenta, setPrintVenta] = useState<VentaRow | null>(null);
  const [printItems, setPrintItems] = useState<VentaItemRow[]>([]);
  const [printReady, setPrintReady] = useState(false);
  const [printClienteSaldo, setPrintClienteSaldo] = useState(0);
  const printRef = useRef<HTMLDivElement>(null);

  const fetchVentas = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("ventas")
      .select("*, clientes(id, nombre, cuit, tipo_factura, domicilio, telefono, situacion_iva, localidad, provincia, codigo_postal, numero_documento)")
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false });

    if (filterOrigen === "pos") query = query.or("origen.eq.pos,origen.is.null");
    else if (filterOrigen === "tienda") query = query.eq("origen", "tienda");
    if (filterType !== "all") query = query.eq("tipo_comprobante", filterType);
    if (filterPayment !== "all") query = query.eq("forma_pago", filterPayment);

    if (filterMode === "month") {
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
  }, [filterOrigen, filterType, filterPayment, filterMode, filterMonth, filterYear, filterFrom, filterTo, searchClient]);

  useEffect(() => { fetchVentas(); }, [fetchVentas]);

  useEffect(() => {
    supabase.from("empresa").select("*").limit(1).single().then(({ data }) => setEmpresa(data));
    supabase.from("usuarios").select("id, nombre").eq("activo", true).then(({ data }) => setVendedores(data || []));
  }, []);

  const openDetail = async (v: VentaRow) => {
    setDetailVenta(v);
    const { data } = await supabase.from("venta_items").select("*").eq("venta_id", v.id).order("created_at");
    setDetailItems((data as VentaItemRow[]) || []);
    setDetailOpen(true);
  };

  const marcarEntregado = async (v: VentaRow) => {
    setActionLoading(v.id);
    await supabase.from("ventas").update({ entregado: true }).eq("id", v.id);
    await fetchVentas();
    setActionLoading(null);
  };

  const getVendedorNombre = (id: string | null) => {
    if (!id) return "—";
    return vendedores.find((v) => v.id === id)?.nombre || "—";
  };

  // ─── Print ───
  const preparePrint = async (v: VentaRow) => {
    const { data } = await supabase.from("venta_items").select("*").eq("venta_id", v.id).order("created_at");
    let saldo = 0;
    if (v.cliente_id) {
      const { data: cd } = await supabase.from("clientes").select("saldo").eq("id", v.cliente_id).single();
      saldo = cd?.saldo || 0;
    }
    setPrintClienteSaldo(saldo);
    setPrintVenta(v);
    setPrintItems((data as VentaItemRow[]) || []);
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
  const totalSum = ventas.reduce((a, v) => {
    const isNC = v.tipo_comprobante.includes("Nota de Crédito");
    return a + (isNC ? -v.total : v.total);
  }, 0);
  const pendientesEntrega = ventas.filter((v) => !v.entregado).length;
  const months = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Listado de Ventas y Remitos</h1>
          <p className="text-muted-foreground text-sm">{ventas.length} comprobantes encontrados</p>
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><Receipt className="w-5 h-5 text-primary" /></div>
            <div><p className="text-xs text-muted-foreground">Comprobantes</p><p className="text-xl font-bold">{ventas.length}</p></div>
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
            <div><p className="text-xs text-muted-foreground">Promedio por ticket</p><p className="text-xl font-bold">{ventas.length > 0 ? formatCurrency(totalSum / ventas.length) : "$0"}</p></div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6 space-y-4">
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
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground font-semibold tracking-wide uppercase">Origen</Label>
                  <Select value={filterOrigen} onValueChange={(v) => setFilterOrigen(v ?? "all")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
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
                    <SelectTrigger><SelectValue /></SelectTrigger>
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
                    <SelectTrigger><SelectValue /></SelectTrigger>
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
                  <Select value={filterMode} onValueChange={(v) => setFilterMode((v ?? "month") as "month" | "range" | "all")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="month">Por mes</SelectItem>
                      <SelectItem value="range">Entre fechas</SelectItem>
                      <SelectItem value="all">Todas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
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
                    <th className="text-left py-3 px-4 font-medium">Fecha</th>
                    <th className="text-left py-3 px-4 font-medium">Cliente</th>
                    <th className="text-left py-3 px-4 font-medium">Forma pago</th>
                    <th className="text-center py-3 px-4 font-medium">Entrega</th>
                    <th className="text-right py-3 px-4 font-medium">Total</th>
                    <th className="text-right py-3 px-4 font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {ventas.map((v) => (
                    <tr key={v.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                      <td className="py-3 px-4">
                        <Badge variant="outline" className={`text-xs font-normal ${v.origen === "tienda" ? "border-pink-300 text-pink-700 bg-pink-50" : "border-blue-300 text-blue-700 bg-blue-50"}`}>
                          {v.origen === "tienda" ? "Tienda" : "POS"}
                        </Badge>
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant={v.tipo_comprobante.includes("Nota de Crédito") ? "destructive" : "secondary"} className="text-xs font-normal">
                          {v.tipo_comprobante}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-muted-foreground">{v.numero}</td>
                      <td className="py-3 px-4 text-muted-foreground">{new Date(v.fecha + "T12:00:00").toLocaleDateString("es-AR")}</td>
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
                      <td className={`py-3 px-4 text-right font-semibold ${v.tipo_comprobante.includes("Nota de Crédito") ? "text-red-500" : ""}`}>
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
                          {!v.entregado && !v.tipo_comprobante.includes("Nota de Crédito") && (
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
                      <th className="text-right py-2 px-3 font-medium">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailItems.map((item) => (
                      <tr key={item.id} className="border-b last:border-0">
                        <td className="py-2 px-3 font-mono text-xs text-muted-foreground">{item.codigo}</td>
                        <td className="py-2 px-3">{item.descripcion}</td>
                        <td className="py-2 px-3 text-center">{item.cantidad}</td>
                        <td className="py-2 px-3 text-right">{formatCurrency(item.precio_unitario)}</td>
                        <td className="py-2 px-3 text-right font-semibold">{formatCurrency(item.subtotal)}</td>
                      </tr>
                    ))}
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

      {/* Hidden print area */}
      {printVenta && (
        <div style={{ position: "fixed", left: "-9999px", top: 0 }} ref={printRef}>
          <ReceiptPrintView
            config={{
              ...defaultReceiptConfig,
              empresaDomicilio: empresa?.domicilio || defaultReceiptConfig.empresaDomicilio,
              empresaTelefono: empresa?.telefono || defaultReceiptConfig.empresaTelefono,
              empresaCuit: empresa?.cuit || defaultReceiptConfig.empresaCuit,
              empresaIva: empresa?.situacion_iva || defaultReceiptConfig.empresaIva,
              empresaIngrBrutos: empresa?.cuit || defaultReceiptConfig.empresaIngrBrutos,
            }}
            sale={{
              numero: printVenta.numero,
              total: printVenta.total,
              subtotal: printVenta.subtotal,
              descuento: Math.round(printVenta.subtotal * (printVenta.descuento_porcentaje || 0) / 100),
              recargo: Math.round(printVenta.subtotal * (printVenta.recargo_porcentaje || 0) / 100),
              transferSurcharge: 0,
              tipoComprobante: printVenta.tipo_comprobante,
              formaPago: printVenta.forma_pago,
              cliente: printVenta.clientes?.nombre || "Consumidor Final",
              vendedor: getVendedorNombre(printVenta.vendedor_id),
              fecha: formatDatePDF(printVenta.fecha),
              saldoAnterior: printClienteSaldo,
              saldoNuevo: printClienteSaldo,
              items: printItems.map((item) => ({
                id: item.id,
                producto_id: item.producto_id || "",
                code: item.codigo,
                description: item.descripcion,
                qty: item.cantidad,
                unit: item.unidad_medida || "Un",
                price: item.precio_unitario,
                discount: item.descuento,
                subtotal: item.subtotal,
                presentacion: "",
                unidades_por_presentacion: 1,
                stock: 0,
                es_combo: false,
                comboItems: [],
              })),
            }}
          />
        </div>
      )}
    </div>
  );
}
